import ts from "typescript";
import type { Diagnostic, Evidence } from "../../ir/types.ts";
import { createNodeId } from "../../ir/ids.ts";
import { mcpSdkStyleForModule, type McpSdkStyle } from "./knownSdk.ts";

export interface DiscoveredMcpTool {
  id: string;
  name: string;
  serverBinding: string;
  sdkStyle: McpSdkStyle;
  inputs: string[];
  evidence: Evidence[];
  handlerStart: number;
  handlerEnd: number;
}

export interface McpToolDiscovery {
  tools: DiscoveredMcpTool[];
  diagnostics: Diagnostic[];
}

type FunctionLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

export function discoverMcpTools(filePath: string, source: string): McpToolDiscovery {
  const scriptKind = /\.[cm]?js$/i.test(filePath) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
  const diagnostics: Diagnostic[] = [];
  const tools: DiscoveredMcpTool[] = [];
  const importedServerClasses = new Map<string, McpSdkStyle>();
  const serverBindings = new Map<string, McpSdkStyle>();
  const staticStrings = new Map<string, string>();
  const handlers = new Map<string, FunctionLike>();

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

  const stringValue = (expression: ts.Expression | undefined): string | undefined => {
    if (!expression) return undefined;
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return expression.text;
    }
    if (ts.isIdentifier(expression)) return staticStrings.get(expression.text);
    return undefined;
  };

  const collectObjectInputNames = (parameter: ts.ParameterDeclaration): string[] => {
    if (ts.isObjectBindingPattern(parameter.name)) {
      return parameter.name.elements
        .map((element) => {
          if (element.propertyName) {
            if (ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName)) {
              return element.propertyName.text;
            }
          }
          return ts.isIdentifier(element.name) ? element.name.text : undefined;
        })
        .filter((name): name is string => Boolean(name))
        .sort();
    }

    if (!ts.isIdentifier(parameter.name)) return [];
    const rootName = parameter.name.text;
    const names = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === rootName
      ) {
        names.add(node.name.text);
      }
      if (
        ts.isElementAccessExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === rootName
        && node.argumentExpression
        && (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
      ) {
        names.add(node.argumentExpression.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(parameter.parent);
    return [...names].sort();
  };

  const resolveHandler = (expression: ts.Expression | undefined): FunctionLike | undefined => {
    if (!expression) return undefined;
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression;
    if (ts.isIdentifier(expression)) return handlers.get(expression.text);
    return undefined;
  };

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const style = mcpSdkStyleForModule(statement.moduleSpecifier.text);
      if (!style) continue;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (imported === "McpServer") importedServerClasses.set(element.name.text, style);
        }
      }
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      handlers.set(statement.name.text, statement);
      continue;
    }

    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const name = declaration.name.text;
      const staticValue = stringValue(declaration.initializer);
      if (staticValue !== undefined) staticStrings.set(name, staticValue);
      if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
        handlers.set(name, declaration.initializer);
      }
      if (
        ts.isNewExpression(declaration.initializer)
        && ts.isIdentifier(declaration.initializer.expression)
      ) {
        const style = importedServerClasses.get(declaration.initializer.expression.text);
        if (style) serverBindings.set(name, style);
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (
          !ts.isIdentifier(declaration.name)
          || !declaration.initializer
          || !ts.isIdentifier(declaration.initializer)
          || serverBindings.has(declaration.name.text)
        ) {
          continue;
        }
        const style = serverBindings.get(declaration.initializer.text);
        if (style) {
          serverBindings.set(declaration.name.text, style);
          changed = true;
        }
      }
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression;
      if (ts.isIdentifier(receiver)) {
        const style = serverBindings.get(receiver.text);
        const method = node.expression.name.text;
        const supportedMethod = style === "v2" ? method === "registerTool" : method === "tool";
        if (style && supportedMethod) {
          const toolName = stringValue(node.arguments[0]);
          if (!toolName) {
            diagnostics.push({
              confidence: "UNKNOWN",
              message: "Dynamic MCP tool name could not be resolved",
              evidence: [evidence(node)],
            });
          } else {
            const handlerExpression = node.arguments[node.arguments.length - 1];
            const handler = resolveHandler(handlerExpression);
            if (!handler) {
              diagnostics.push({
                confidence: "UNKNOWN",
                message: "MCP tool handler could not be resolved",
                evidence: [evidence(node, toolName)],
              });
            } else {
              const firstParameter = handler.parameters[0];
              const inputs = firstParameter ? collectObjectInputNames(firstParameter) : [];
              tools.push({
                id: createNodeId("tool", filePath, `${receiver.text}:${toolName}`),
                name: toolName,
                serverBinding: receiver.text,
                sdkStyle: style,
                inputs,
                evidence: [evidence(node, toolName)],
                handlerStart: handler.getStart(sourceFile),
                handlerEnd: handler.getEnd(),
              });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  tools.sort((a, b) => `${a.serverBinding}:${a.name}`.localeCompare(`${b.serverBinding}:${b.name}`));
  return { tools, diagnostics };
}
