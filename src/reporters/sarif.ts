import type { Finding } from "../analysis/findings.ts";

type SarifLevel = "error" | "warning" | "note";

function levelFor(finding: Finding): SarifLevel {
  if (finding.severity === "critical" || finding.severity === "high") return "error";
  if (finding.severity === "medium") return "warning";
  return "note";
}

function locationFor(finding: Finding): object[] {
  const evidence = finding.evidence[0];
  if (!evidence) return [];

  const region = evidence.startLine === undefined
    ? undefined
    : {
        startLine: evidence.startLine,
        ...(evidence.endLine === undefined ? {} : { endLine: evidence.endLine }),
      };

  return [
    {
      physicalLocation: {
        artifactLocation: {
          uri: evidence.file.replaceAll("\\", "/"),
        },
        ...(region === undefined ? {} : { region }),
      },
    },
  ];
}

export function renderSarif(findings: Finding[]): string {
  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "ScopeGraph",
            rules: findings.map((finding) => ({
              id: finding.ruleId,
              shortDescription: { text: finding.title },
              defaultConfiguration: { level: levelFor(finding) },
            })),
          },
        },
        results: findings.map((finding) => ({
          ruleId: finding.ruleId,
          level: levelFor(finding),
          message: { text: finding.title },
          locations: locationFor(finding),
        })),
      },
    ],
  };

  return `${JSON.stringify(sarif, null, 2)}\n`;
}
