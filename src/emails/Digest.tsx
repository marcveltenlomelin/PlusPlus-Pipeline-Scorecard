import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { DigestData } from "@/lib/digest";
import type { DigestSection } from "@/lib/types";

/**
 * The weekly digest email. Deliberately light-themed (the dashboard's dark
 * palette doesn't survive Gmail dark-mode inversion) with the brand green and
 * accent as highlights. Inline styles only — email clients ignore stylesheets.
 * Dumb component: everything is precomputed in lib/digest.ts.
 */

const INK = "#1d2025";
const SOFT = "#5b6068";
const FAINT = "#8a8f97";
const RULE = "#e4e2db";
const PANEL = "#f7f6f2";
const GREEN = "#1e9e66";
const ACCENT = "#4f66d8";
const BAD = "#c64539";
const WARN = "#a96f1f";

const CHIP_COLOR: Record<string, string> = {
  "STALE DEAL": BAD,
  PACING: WARN,
  CONVERSION: ACCENT,
  REVIVAL: "#7a5fc0",
  GOAL: GREEN,
};

const mono = "ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, monospace";

interface DigestEmailProps {
  data: DigestData;
  appUrl: string;
  unsubscribeUrl: string;
  sections: Record<DigestSection, boolean>;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={{ margin: "24px 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: FAINT, textTransform: "uppercase" as const }}>
      {children}
    </Text>
  );
}

export default function DigestEmail({ data, appUrl, unsubscribeUrl, sections }: DigestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{data.subject}</Preview>
      <Body style={{ margin: 0, backgroundColor: "#edece7", fontFamily: "'Helvetica Neue', Arial, sans-serif", color: INK }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "28px 20px" }}>
          <Heading as="h1" style={{ fontSize: 18, fontWeight: 800, margin: "0 0 2px" }}>
            PlusPlus Pipeline
          </Heading>
          <Text style={{ margin: 0, fontSize: 12, color: SOFT }}>
            Week of {data.weekLabel}
            {data.variant === "aggregate" ? " · aggregate view" : ""}
          </Text>

          {sections.funnel && (
            <>
              <SectionTitle>Stage entries this week</SectionTitle>
              <Section style={{ backgroundColor: PANEL, border: `1px solid ${RULE}`, padding: "4px 14px" }}>
                {data.funnel.map((f, i) => (
                  <table key={i} width="100%" cellPadding={0} cellSpacing={0} style={{ borderBottom: i < data.funnel.length - 1 ? `1px solid ${RULE}` : "none" }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: "8px 0", fontSize: 13 }}>{f.stage}</td>
                        <td align="right" style={{ padding: "8px 0", fontFamily: mono, fontSize: 14, fontWeight: 700 }}>
                          {f.count}
                          {f.goal !== null && <span style={{ color: FAINT, fontWeight: 400, fontSize: 12 }}> / {f.goal}</span>}
                          {f.pace && (
                            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: f.pace === "ahead" || f.pace === "on pace" ? GREEN : f.pace === "slightly behind" ? WARN : BAD, textTransform: "uppercase" as const }}>
                              {f.pace}
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ))}
              </Section>
            </>
          )}

          {sections.sdr && data.sdrs.length > 0 && (
            <>
              <SectionTitle>By SDR · this week</SectionTitle>
              <Section style={{ backgroundColor: PANEL, border: `1px solid ${RULE}`, padding: "4px 14px" }}>
                <table width="100%" cellPadding={0} cellSpacing={0}>
                  <tbody>
                    <tr>
                      <td style={{ padding: "8px 0 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: FAINT }}>SDR</td>
                      {["SALS", "SQLS", "DD", "PILOTS", "PIPE $"].map((h) => (
                        <td key={h} align="right" style={{ padding: "8px 0 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: FAINT }}>{h}</td>
                      ))}
                    </tr>
                    {data.sdrs.map((s, i) => (
                      <tr key={i}>
                        <td style={{ padding: "7px 0", fontSize: 13, fontWeight: s.name === "Unassigned" ? 400 : 600, color: s.name === "Unassigned" ? FAINT : INK, borderTop: `1px solid ${RULE}` }}>{s.name}</td>
                        {[s.sals, s.sqls, s.deepdives, s.pilots].map((n, j) => (
                          <td key={j} align="right" style={{ padding: "7px 0", fontFamily: mono, fontSize: 13, fontWeight: n > 0 ? 700 : 400, color: n > 0 ? INK : FAINT, borderTop: `1px solid ${RULE}` }}>{n}</td>
                        ))}
                        <td align="right" style={{ padding: "7px 0", fontFamily: mono, fontSize: 13, borderTop: `1px solid ${RULE}` }}>{s.pipe}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            </>
          )}

          {sections.revenue && (
            <>
              <SectionTitle>Revenue</SectionTitle>
              <Section style={{ backgroundColor: PANEL, border: `1px solid ${RULE}`, padding: "4px 14px" }}>
                {data.revenue.map((r, i) => (
                  <table key={i} width="100%" cellPadding={0} cellSpacing={0} style={{ borderBottom: i < data.revenue.length - 1 ? `1px solid ${RULE}` : "none" }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: "8px 0", fontSize: 13, color: SOFT }}>{r.label}</td>
                        <td align="right" style={{ padding: "8px 0", fontFamily: mono, fontSize: 14, fontWeight: 700 }}>{r.value}</td>
                      </tr>
                    </tbody>
                  </table>
                ))}
              </Section>
            </>
          )}

          {sections.focus && data.focus.length > 0 && (
            <>
              <SectionTitle>{"Today's Focus"}</SectionTitle>
              {data.focus.map((f, i) => (
                <Section key={i} style={{ backgroundColor: PANEL, border: `1px solid ${RULE}`, borderLeft: `3px solid ${CHIP_COLOR[f.category] ?? GREEN}`, padding: "12px 14px", marginBottom: 8 }}>
                  <Text style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: CHIP_COLOR[f.category] ?? GREEN }}>
                    {f.category}
                  </Text>
                  <Text style={{ margin: "6px 0 2px", fontSize: 14, fontWeight: 600, lineHeight: "20px" }}>{f.diagnosis}</Text>
                  <Text style={{ margin: 0, fontSize: 13, color: SOFT, lineHeight: "19px" }}>
                    {f.action}
                    {f.href ? (
                      <>
                        {" "}
                        <Link href={f.href} style={{ color: ACCENT }}>
                          Open in HubSpot →
                        </Link>
                      </>
                    ) : null}
                  </Text>
                </Section>
              ))}
            </>
          )}

          {sections.stale && (
            <>
              <SectionTitle>Stale deals · needs attention</SectionTitle>
              <Section style={{ backgroundColor: PANEL, border: `1px solid ${RULE}`, padding: "10px 14px" }}>
                {data.stale.count === 0 ? (
                  <Text style={{ margin: 0, fontSize: 13, color: FAINT }}>No stale deals — nice.</Text>
                ) : (
                  <>
                    <Text style={{ margin: "0 0 6px", fontSize: 12, color: SOFT }}>
                      {data.stale.count} {data.stale.count === 1 ? "deal" : "deals"} · {data.stale.totalValue} parked
                    </Text>
                    {data.stale.rows.map((r, i) => (
                      <Text key={i} style={{ margin: "4px 0", fontFamily: mono, fontSize: 12, lineHeight: "18px" }}>
                        <span style={{ color: BAD }}>●</span> {r.name} · {r.stage} · {r.days}d · {r.value}
                      </Text>
                    ))}
                  </>
                )}
              </Section>
            </>
          )}

          {sections.headline && (
            <>
              <SectionTitle>Headline KPIs</SectionTitle>
              <Section style={{ backgroundColor: PANEL, border: `1px solid ${RULE}`, padding: "4px 14px" }}>
                {data.kpis.map((kpi, i) => (
                  <table key={i} width="100%" cellPadding={0} cellSpacing={0} style={{ borderBottom: i < data.kpis.length - 1 ? `1px solid ${RULE}` : "none" }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: "9px 0", fontSize: 13, color: SOFT }}>{kpi.label}</td>
                        <td align="right" style={{ padding: "9px 0", fontFamily: mono, fontSize: 14, fontWeight: 700 }}>{kpi.value}</td>
                      </tr>
                      <tr>
                        <td colSpan={2} style={{ paddingBottom: 9, fontFamily: mono, fontSize: 11, color: FAINT }}>{kpi.detail}</td>
                      </tr>
                    </tbody>
                  </table>
                ))}
              </Section>
            </>
          )}

          <Section style={{ textAlign: "center" as const, margin: "28px 0 8px" }}>
            <Button href={appUrl} style={{ backgroundColor: ACCENT, color: "#ffffff", fontSize: 14, fontWeight: 700, padding: "12px 22px", borderRadius: 2 }}>
              Open full scorecard →
            </Button>
          </Section>

          <Hr style={{ borderColor: RULE, margin: "20px 0 12px" }} />
          <Text style={{ margin: 0, fontSize: 11, color: FAINT, textAlign: "center" as const }}>
            Counts are stage entries per period, not board occupancy.{" "}
            <Link href={unsubscribeUrl} style={{ color: FAINT, textDecoration: "underline" }}>
              Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
