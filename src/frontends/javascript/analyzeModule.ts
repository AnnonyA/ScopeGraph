import ts from "typescript";
import { AgentGraph } from "../../ir/graph.ts";
import { createNodeId } from "../../ir/ids.ts";
import type {
  Capability,
  CapabilityKind,
  Diagnostic,
  Evidence,
} from "../../ir/types.ts";
import type { DiscoveredMcpTool } from "../mcp-sdk/discoverTools.ts";
import {
  executionCapability,
  filesystemWriteApis,
  isChildProcessModule,
  isFileSystemModule,
  processExecutionApis,
} from "./knownApis.ts";

export interface ModuleAnalysis {
  graph: AgentGraph;
  sources: Set<string>;
  sensitiveSources: Set<string>;
  sinks: Set<string>;
  fileWriteSinks: Set<string>;
  networkSinks: Set<string>;
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
  const sensitiveSources = new Set<string>();
  const sinks = new Set<string>();
  const fileWriteSinks = new Set<string>();
  const networkSinks = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const capabilities: Capability[] = [];
  const capabilityKeys = new Set<string>();
  const executionNames = new Map<string, string>();
  const childProcessNamespaces = new Set<string>();
  const fileWriteNames = new Map<string, string>();
  const fileSystemNamespaces = new Set<string>();
  const taintedNames = new Map<string, string>();
  const taintedProperties = new Map<string, string>();
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

  const addToolCapability = (
    tool: DiscoveredMcpTool,
    kind: CapabilityKind,
    target: string,
    node: ts.Node,
    symbol: string,
  ): void => {
    const sourceName = `mcp-tool:${tool.name}`;
    const key = `${kind}:${sourceName}:${target}`;
    if (capabilityKeys.has(key)) return;
    capabilityKeys.add(key);
    capabilities.push({
      id: createNodeId("capability", filePath, key),
      kind,
      source: sourceName,
      target,
      evidence: [evidence(node, symbol)],
    });
  };

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
    const moduleName = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;

    if (isChildProcessModule(moduleName)) {
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (processExecutionApis.has(imported)) executionNames.set(element.name.text, imported);
        }
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        childProcessNamespaces.add(bindings.name.text);
      }
    }

    if (isFileSystemModule(moduleName)) {
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (filesystemWriteApis.has(imported)) fileWriteNames.set(element.name.text, imported);
        }
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        fileSystemNamespaces.add(bindings.name.text);
      }
    }
  }

  const isProcessEnv = (expression: ts.Expression): boolean => (
    ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === "process"
    && expression.name.text === "env"
  );

  const environmentKeyForExpression = (expression: ts.Expression): string | undefined => {
    if (ts.isPropertyAccessExpression(expression) && isProcessEnv(expression.expression)) {
      return expression.name.text;
    }
    if (
      ts.isElementAccessExpression(expression)
      && isProcessEnv(expression.expression)
      && expression.argumentExpression
      && (ts.isStringLiteral(expression.argumentExpression)
        || ts.isNoSubstitutionTemplateLiteral(expression.argumentExpression))
    ) {
      return expression.argumentExpression.text;
    }
    return undefined;
  };

  const environmentSourceForExpression = (expression: ts.Expression): string | undefined => {
    const key = environmentKeyForExpression(expression);
    if (!key) return undefined;
    const label = `process.env.${key}`;
    const id = createNodeId("environment", filePath, label);
    graph.addNode({ id, kind: "environment", label, evidence: [evidence(expression, label)] });
    sensitiveSources.add(id);
    return id;
  };

  const taintForExpression = (expression: ts.Expression): string | undefined => {
    const environmentSource = environmentSourceForExpression(expression);
    if (environmentSource) return environmentSource;

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
    if (ts.isObjectLiteralExpression(expression)) {
      for (const property of expression.properties) {
        if (ts.isPropertyAssignment(property)) {
          const taint = taintForExpression(property.initializer);
          if (taint) return taint;
        }
        if (ts.isShorthandPropertyAssignment(property)) {
          const taint = taintedNames.get(property.name.text);
          if (taint) return taint;
        }
        if (ts.isSpreadAssignment(property)) {
          const taint = taintForExpression(property.expression);
          if (taint) return taint;
        }
      }
    }
    if (ts.isArrayLiteralExpression(expression)) {
      for (const element of expression.elements) {
        if (!ts.isExpression(element)) continue;
        const taint = taintForExpression(element);
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

  const filesystemWriteApiName = (expression: ts.Expression): string | undefined => {
    if (ts.isIdentifier(expression)) return fileWriteNames.get(expression.text);
    if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
      if (
        fileSystemNamespaces.has(expression.expression.text)
        && filesystemWriteApis.has(expression.name.text)
      ) {
        return expression.name.text;
      }
    }
    return undefined;
  };

  const networkTargetForFetch = (node: ts.CallExpression): string => {
    const target = node.arguments[0];
    if (!target || (!ts.isStringLiteral(target) && !ts.isNoSubstitutionTemplateLiteral(target))) {
      return "<dynamic>";
    }
    try {
      const parsed = new URL(target.text);
      return parsed.origin === "null" ? parsed.protocol : parsed.origin;
    } catch {
      return "<dynamic>";
    }
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

  const visit = (node: ts.Node, activeMcpTool?: DiscoveredMcpTool): void => {
    let currentTool = activeMcpTool;

    if (
      ts.isFunctionDeclaration(node)
      || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node)
      || ts.isMethodDeclaration(node)
    ) {
      const mcpTool = mcpHandlerByRange.get(handlerKey(node));
      if (mcpTool) {
        currentTool = mcpTool;
        seedMcpToolInputs(node, mcpTool);
      } else {
        currentTool = undefined;
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

    if (
      currentTool
      && (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    ) {
      const environmentKey = environmentKeyForExpression(node);
      if (environmentKey) {
        addToolCapability(
          currentTool,
          "environment.read",
          environmentKey,
          node,
          `process.env.${environmentKey}`,
        );
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
      }
    }

    if (ts.isCallExpression(node)) {
      const apiName = executionApiName(node.expression);
      if (apiName) {
        const label = node.expression.getText(sourceFile);
        const sink = createNodeId("process", filePath, `${label}@${node.pos}`);
        graph.addNode({ id: sink, kind: "process", label, evidence: [evidence(node, label)] });
        sinks.add(sink);

        const kind = executionCapability(apiName);
        if (currentTool && kind) {
          addToolCapability(currentTool, kind, `child_process.${apiName}`, node, label);
        }

        const first = node.arguments[0];
        if (first) {
          const incoming = taintForExpression(first);
          if (incoming) {
            graph.addEdge({ from: incoming, to: sink, kind: "executes", evidence: [evidence(node, label)] });
          }
        }
      } else {
        const fileApiName = filesystemWriteApiName(node.expression);
        if (fileApiName) {
          const label = node.expression.getText(sourceFile);
          const sink = createNodeId("file", filePath, `${label}@${node.pos}`);
          graph.addNode({ id: sink, kind: "file", label, evidence: [evidence(node, label)] });
          fileWriteSinks.add(sink);

          if (currentTool) {
            addToolCapability(currentTool, "filesystem.write", `fs.${fileApiName}`, node, label);
          }

          for (const argument of node.arguments.slice(0, 2)) {
            const incoming = taintForExpression(argument);
            if (!incoming) continue;
            graph.addEdge({ from: incoming, to: sink, kind: "writes", evidence: [evidence(node, label)] });
          }
        } else if (ts.isIdentifier(node.expression) && node.expression.text === "fetch") {
          const label = "fetch";
          const sink = createNodeId("network", filePath, `${label}@${node.pos}`);
          graph.addNode({ id: sink, kind: "network", label, evidence: [evidence(node, label)] });
          networkSinks.add(sink);

          if (currentTool) {
            addToolCapability(
              currentTool,
              "network.send",
              networkTargetForFetch(node),
              node,
              label,
            );
          }

          for (const argument of node.arguments) {
            const incoming = taintForExpression(argument);
            if (!incoming) continue;
            graph.addEdge({ from: incoming, to: sink, kind: "sends-to", evidence: [evidence(node, label)] });
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
    }

    ts.forEachChild(node, (child) => visit(child, currentTool));
  };

  visit(sourceFile);
  capabilities.sort((a, b) => `${a.source}:${a.kind}:${a.target}`.localeCompare(`${b.source}:${b.kind}:${b.target}`));
  return {
    graph,
    sources,
    sensitiveSources,
    sinks,
    fileWriteSinks,
    networkSinks,
    capabilities,
    diagnostics,
  };
}
