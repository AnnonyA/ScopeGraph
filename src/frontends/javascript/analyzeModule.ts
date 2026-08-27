import ts from "typescript";
import { AgentGraph } from "../../ir/graph.ts";
import { createNodeId } from "../../ir/ids.ts";
import type { Diagnostic, Evidence } from "../../ir/types.ts";
import { isChildProcessModule, processExecutionApis } from "./knownApis.ts";

export interface ModuleAnalysis {
  graph: AgentGraph;
  sources: Set<string>;
  sinks: Set<string>;
  diagnostics: Diagnostic[];
}

export function analyzeModuleSource(filePath: string, source: string): ModuleAnalysis {
  const scriptKind = /\.[cm]?js$/i.test(filePath) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
  const graph = new AgentGraph();
  const sources = new Set<string>();
  const sinks = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const sinkNames = new Set<string>();
  const childProcessNamespaces = new Set<string>();
  const taintedNames = new Map<string, string>();
  const dynamicCallNames = new Set<string>();

  const evidence = (node: ts.Node, symbol?: string): Evidence => {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return {
      file: filePath,
      startLine: start.line + 1,
      endLine: end.line + 1,
      ...(symbol ? { symbol } : {}),
    };
  };

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!isChildProcessModule(statement.moduleSpecifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        if (processExecutionApis.has(imported)) sinkNames.add(element.name.text);
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      childProcessNamespaces.add(bindings.name.text);
    }
  }

  const taintForExpression = (expression: ts.Expression): string | undefined => {
    if (ts.isIdentifier(expression)) return taintedNames.get(expression.text);
    if (ts.isPropertyAccessExpression(expression)) return taintForExpression(expression.expression);
    if (ts.isElementAccessExpression(expression)) return taintForExpression(expression.expression);
    if (ts.isParenthesizedExpression(expression)) return taintForExpression(expression.expression);
    if (ts.isBinaryExpression(expression)) {
      return taintForExpression(expression.left) ?? taintForExpression(expression.right);
    }
    if (ts.isTemplateExpression(expression)) {
      for (const span of expression.templateSpans) {
        const taint = taintForExpression(span.expression);
        if (taint) return taint;
      }
    }
    return undefined;
  };

  const isExecutionCallee = (expression: ts.Expression): boolean => {
    if (ts.isIdentifier(expression)) return sinkNames.has(expression.text);
    if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
      return childProcessNamespaces.has(expression.expression.text)
        && processExecutionApis.has(expression.name.text);
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node)
      || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node)
      || ts.isMethodDeclaration(node)
    ) {
      for (const parameter of node.parameters) {
        if (!ts.isIdentifier(parameter.name)) continue;
        const name = parameter.name.text;
        const id = createNodeId("user-input", filePath, `${name}@${parameter.pos}`);
        graph.addNode({ id, kind: "user-input", label: name, evidence: [evidence(parameter, name)] });
        sources.add(id);
        taintedNames.set(name, id);
      }
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const name = node.name.text;
      if (ts.isIdentifier(node.initializer) && sinkNames.has(node.initializer.text)) {
        sinkNames.add(name);
      }
      if (
        ts.isElementAccessExpression(node.initializer)
        || (ts.isCallExpression(node.initializer) && !isExecutionCallee(node.initializer.expression))
      ) {
        dynamicCallNames.add(name);
      }

      const incoming = taintForExpression(node.initializer);
      if (incoming) {
        const id = createNodeId("command", filePath, `${name}@${node.pos}`);
        graph.addNode({ id, kind: "command", label: name, evidence: [evidence(node, name)] });
        graph.addEdge({ from: incoming, to: id, kind: "passes-to", evidence: [evidence(node, name)] });
        taintedNames.set(name, id);
      }
    }

    if (ts.isCallExpression(node)) {
      if (isExecutionCallee(node.expression)) {
        const label = node.expression.getText(sourceFile);
        const sink = createNodeId("process", filePath, `${label}@${node.pos}`);
        graph.addNode({ id: sink, kind: "process", label, evidence: [evidence(node, label)] });
        sinks.add(sink);
        const first = node.arguments[0];
        if (first) {
          const incoming = taintForExpression(first);
          if (incoming) {
            graph.addEdge({ from: incoming, to: sink, kind: "executes", evidence: [evidence(node, label)] });
          }
        }
      } else {
        const dynamic =
          (ts.isIdentifier(node.expression) && dynamicCallNames.has(node.expression.text))
          || ts.isElementAccessExpression(node.expression);
        if (dynamic) {
          diagnostics.push({
            confidence: "UNKNOWN",
            message: "Computed call target cannot be resolved statically",
            evidence: [evidence(node)],
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { graph, sources, sinks, diagnostics };
}
