import ts from "typescript";
import { AgentGraph } from "../../ir/graph.ts";
import { createNodeId } from "../../ir/ids.ts";
import type { Capability, Diagnostic, Evidence } from "../../ir/types.ts";
import type { DiscoveredMcpTool } from "../mcp-sdk/discoverTools.ts";
import { executionCapability, isChildProcessModule, processExecutionApis } from "./knownApis.ts";

export interface ModuleAnalysis {
  graph: AgentGraph;
  sources: Set<string>;
  sinks: Set<string>;
  capabilities: Capability[];
  diagnostics: Diagnostic[];
}

export interface AnalyzeModuleOptions {
  mcpTools?: readonly DiscoveredMcpTool[];
}

export function analyzeModuleSource(
  filePath: string,
  source: string,
  options: AnalyzeModuleOptions = {},
): ModuleAnalysis {
  const scriptKind = /\.[cm]?js$/i.test(filePath) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
  const graph = new AgentGraph();
  const sources = new Set<string>();
  const sinks = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const capabilities: Capability[] = [];
  const capabilityKeys = new Set<string>();
  const executionNames = new Map<string, string>();
  const childProcessNamespaces = new Set<string>();
  const taintedNames = new Map<string, string>();
  const taintedProperties = new Map<string, string>();
  const taintToolNames = new Map<string, string>();
  const dynamicCallNames = new Set<string>();
  const mcpHandlerByRange = new Map<string, DiscoveredMcpTool>();

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

  const handlerKey = (node: ts.Node): string => `${node.getStart(sourceFile)}:${node.getEnd()}`;

  for (const tool of options.mcpTools ?? []) {
    mcpHandlerByRange.set(`${tool.handlerStart}:${tool.handlerEnd}`, tool);
    const serverId = createNodeId("mcp-server", filePath, tool.serverBinding);
    const handlerId = createNodeId("function", filePath, `${tool.name}@${tool.handlerStart}`);
    graph.addNode({ id: serverId, kind: "mcp-server", label: tool.serverBinding, evidence: tool.evidence });
    graph.addNode({ id: tool.id, kind: "tool", label: tool.name, evidence: tool.evidence });
    graph.addNode({ id: handlerId, kind: "function", label: `${tool.name} handler`, evidence: tool.evidence });
    graph.addEdge({ from: serverId, to: tool.id, kind: "registers", evidence: tool.evidence });
    graph.addEdge({ from: tool.id, to: handlerId, kind: "invokes", evidence: tool.evidence });
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!isChildProcessModule(statement.moduleSpecifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        if (processExecutionApis.has(imported)) executionNames.set(element.name.text, imported);
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      childProcessNamespaces.add(bindings.name.text);
    }
  }

  const taintForExpression = (expression: ts.Expression): string | undefined => {
    if (ts.isIdentifier(expression)) return taintedNames.get(expression.text);
    if (ts.isPropertyAccessExpression(expression)) {
      if (ts.isIdentifier(expression.expression)) {
        const exact = taintedProperties.get(`${expression.expression.text}.${expression.name.text}`);
        if (exact) return exact;
      }
      return taintForExpression(expression.expression);
    }
    if (ts.isElementAccessExpression(expression)) {
      if (
        ts.isIdentifier(expression.expression)
        && expression.argumentExpression
        && (ts.isStringLiteral(expression.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(expression.argumentExpression))
      ) {
        const exact = taintedProperties.get(
          `${expression.expression.text}.${expression.argumentExpression.text}`,
        );
        if (exact) return exact;
      }
      return taintForExpression(expression.expression);
    }
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

  const executionApiName = (expression: ts.Expression): string | undefined => {
    if (ts.isIdentifier(expression)) return executionNames.get(expression.text);
    if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
      if (
        childProcessNamespaces.has(expression.expression.text)
        && processExecutionApis.has(expression.name.text)
      ) {
        return expression.name.text;
      }
    }
    return undefined;
  };

  const seedMcpToolInputs = (
    node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration,
    tool: DiscoveredMcpTool,
  ): void => {
    const parameter = node.parameters[0];
    if (!parameter) return;

    const addSource = (inputName: string, localName?: string, rootName?: string): void => {
      const label = `${tool.name}.${inputName}`;
      const id = createNodeId("mcp-tool-input", filePath, `${label}@${parameter.pos}`);
      graph.addNode({ id, kind: "mcp-tool-input", label, evidence: [evidence(parameter, label)] });
      sources.add(id);
      taintToolNames.set(id, tool.name);
      if (localName) taintedNames.set(localName, id);
      if (rootName) taintedProperties.set(`${rootName}.${inputName}`, id);
    };

    if (ts.isObjectBindingPattern(parameter.name)) {
      for (const element of parameter.name.elements) {
        const inputName = element.propertyName
          && (ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName))
          ? element.propertyName.text
          : ts.isIdentifier(element.name)
            ? element.name.text
            : undefined;
        const localName = ts.isIdentifier(element.name) ? element.name.text : undefined;
        if (inputName) addSource(inputName, localName);
      }
      return;
    }

    if (ts.isIdentifier(parameter.name)) {
      for (const inputName of tool.inputs) addSource(inputName, undefined, parameter.name.text);
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node)
      || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node)
      || ts.isMethodDeclaration(node)
    ) {
      const mcpTool = mcpHandlerByRange.get(handlerKey(node));
      if (mcpTool) {
        seedMcpToolInputs(node, mcpTool);
      } else {
        for (const parameter of node.parameters) {
          if (!ts.isIdentifier(parameter.name)) continue;
          const name = parameter.name.text;
          const id = createNodeId("user-input", filePath, `${name}@${parameter.pos}`);
          graph.addNode({ id, kind: "user-input", label: name, evidence: [evidence(parameter, name)] });
          sources.add(id);
          taintedNames.set(name, id);
        }
      }
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const name = node.name.text;
      if (ts.isIdentifier(node.initializer)) {
        const apiName = executionNames.get(node.initializer.text);
        if (apiName) executionNames.set(name, apiName);
      }
      if (
        ts.isElementAccessExpression(node.initializer)
        || (ts.isCallExpression(node.initializer) && !executionApiName(node.initializer.expression))
      ) {
        dynamicCallNames.add(name);
      }

      const incoming = taintForExpression(node.initializer);
      if (incoming) {
        const id = createNodeId("command", filePath, `${name}@${node.pos}`);
        graph.addNode({ id, kind: "command", label: name, evidence: [evidence(node, name)] });
        graph.addEdge({ from: incoming, to: id, kind: "passes-to", evidence: [evidence(node, name)] });
        taintedNames.set(name, id);
        const toolName = taintToolNames.get(incoming);
        if (toolName) taintToolNames.set(id, toolName);
      }
    }

    if (ts.isCallExpression(node)) {
      const apiName = executionApiName(node.expression);
      if (apiName) {
        const label = node.expression.getText(sourceFile);
        const sink = createNodeId("process", filePath, `${label}@${node.pos}`);
        graph.addNode({ id: sink, kind: "process", label, evidence: [evidence(node, label)] });
        sinks.add(sink);
        const first = node.arguments[0];
        if (first) {
          const incoming = taintForExpression(first);
          if (incoming) {
            graph.addEdge({ from: incoming, to: sink, kind: "executes", evidence: [evidence(node, label)] });
            const toolName = taintToolNames.get(incoming);
            const kind = executionCapability(apiName);
            if (toolName && kind) {
              const target = `child_process.${apiName}`;
              const sourceName = `mcp-tool:${toolName}`;
              const key = `${kind}:${sourceName}:${target}`;
              if (!capabilityKeys.has(key)) {
                capabilityKeys.add(key);
                capabilities.push({
                  id: createNodeId("capability", filePath, key),
                  kind,
                  source: sourceName,
                  target,
                  evidence: [evidence(node, label)],
                });
              }
            }
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
  capabilities.sort((a, b) => `${a.source}:${a.kind}:${a.target}`.localeCompare(`${b.source}:${b.kind}:${b.target}`));
  return { graph, sources, sinks, capabilities, diagnostics };
}
