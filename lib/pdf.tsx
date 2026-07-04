import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
  Link,
} from "@react-pdf/renderer";
import type { Report } from "./types";

const C = {
  ink: "#1d1d1f",
  sub: "#6e6e73",
  accent: "#0066cc",
  line: "#e0e0e0",
  chipBg: "#f5f5f7",
  dark: "#1d1d1f",
};

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: C.ink, fontFamily: "Helvetica", lineHeight: 1.5 },
  brandBar: {
    backgroundColor: C.dark,
    marginHorizontal: -40,
    marginTop: -40,
    paddingHorizontal: 40,
    paddingVertical: 22,
    marginBottom: 24,
  },
  brandBarRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { color: "#67b0ff", fontSize: 9, letterSpacing: 2, fontFamily: "Helvetica-Bold" },
  brandSub: { color: "#94a3b8", fontSize: 8, marginTop: 3, letterSpacing: 1 },
  companyName: { color: "#ffffff", fontSize: 24, fontFamily: "Helvetica-Bold", marginTop: 8 },
  logo: { width: 40, height: 40, objectFit: "contain", borderRadius: 4, backgroundColor: "#ffffff" },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingBottom: 4,
  },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { width: 90, color: C.sub, fontFamily: "Helvetica-Bold" },
  value: { flex: 1 },
  summary: { color: C.ink, marginBottom: 4 },
  bullet: { flexDirection: "row", marginBottom: 3 },
  dot: { width: 12, color: C.accent, fontFamily: "Helvetica-Bold" },
  bulletText: { flex: 1 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: {
    backgroundColor: C.chipBg,
    color: C.ink,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 3,
    fontSize: 9,
  },
  compRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  compName: { width: "40%", fontFamily: "Helvetica-Bold" },
  compSite: { width: "60%", color: "#2563eb" },
  matrixHeader: {
    flexDirection: "row",
    backgroundColor: C.chipBg,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  matrixRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  matrixColName: { width: "25%", fontFamily: "Helvetica-Bold", paddingRight: 4 },
  matrixCol: { width: "25%", paddingRight: 4, color: C.sub },
  link: { color: "#2563eb", textDecoration: "none" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: C.sub,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 8,
  },
});



function ReportDoc({ report }: { report: Report }) {
  const c = report.company;
  const brandAccent = report.brandColor || "#0066cc";
  
  return (
    <Document title={`${c.name} — Company Research Report`} author="Relu Consultancy">
      <Page size="A4" style={s.page}>
        <View style={[s.brandBar, { borderBottomWidth: 3, borderBottomColor: brandAccent }]}>
          <View style={s.brandBarRow}>
            <View>
              <Text style={s.brand}>RELU CONSULTANCY</Text>
              <Text style={s.brandSub}>COMPANY RESEARCH REPORT</Text>
              <Text style={s.companyName}>{c.name}</Text>
            </View>
            {report.logo ? <Image src={report.logo} style={s.logo} /> : null}
          </View>
        </View>

        <Text style={[s.sectionTitle, { color: brandAccent, borderBottomColor: brandAccent }]}>Company Information</Text>
        {c.website ? (
          <View style={s.row}>
            <Text style={s.label}>Website</Text>
            <Link src={c.website} style={[s.value, s.link, { color: brandAccent }]}>{c.website}</Link>
          </View>
        ) : null}
        <View style={s.row}>
          <Text style={s.label}>Phone</Text>
          <Text style={s.value}>{c.phone || "Not publicly listed"}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Address</Text>
          <Text style={s.value}>{c.address || "Not publicly listed"}</Text>
        </View>

        {c.summary ? (
          <>
            <Text style={[s.sectionTitle, { color: brandAccent, borderBottomColor: brandAccent }]}>Summary</Text>
            <Text style={s.summary}>{c.summary}</Text>
          </>
        ) : null}

        {c.products.length ? (
          <>
            <Text style={[s.sectionTitle, { color: brandAccent, borderBottomColor: brandAccent }]}>Products & Services</Text>
            <View style={s.chipWrap}>
              {c.products.map((p, i) => (
                <Text key={i} style={s.chip}>{p}</Text>
              ))}
            </View>
          </>
        ) : null}

        {c.painPoints.length ? (
          <>
            <Text style={[s.sectionTitle, { color: brandAccent, borderBottomColor: brandAccent }]}>AI-Generated Pain Points</Text>
            {c.painPoints.map((t, i) => (
              <View key={i} style={s.bullet}>
                <Text style={[s.dot, { color: brandAccent }]}>▪</Text>
                <Text style={s.bulletText}>{t}</Text>
              </View>
            ))}
          </>
        ) : null}

        {report.competitorMatrix && report.competitorMatrix.length ? (
          <>
            <Text style={[s.sectionTitle, { color: brandAccent, borderBottomColor: brandAccent }]}>Competitor Matrix</Text>
            <View style={s.matrixHeader}>
              <Text style={[s.matrixColName, { color: C.sub }]}>Competitor</Text>
              <Text style={s.matrixCol}>Audience</Text>
              <Text style={s.matrixCol}>Strength</Text>
              <Text style={s.matrixCol}>Pricing</Text>
            </View>
            {report.competitorMatrix.map((comp, i) => (
              <View key={i} style={s.matrixRow}>
                <Text style={s.matrixColName}>{comp.name}</Text>
                <Text style={s.matrixCol}>{comp.audience}</Text>
                <Text style={s.matrixCol}>{comp.coreStrength}</Text>
                <Text style={s.matrixCol}>{comp.pricingModel}</Text>
              </View>
            ))}
          </>
        ) : report.competitors.length ? (
          <>
            <Text style={[s.sectionTitle, { color: brandAccent, borderBottomColor: brandAccent }]}>Competitors</Text>
            {report.competitors.map((comp, i) => (
              <View key={i} style={s.compRow}>
                <Text style={s.compName}>{comp.name}</Text>
                {comp.website ? (
                  <Link src={comp.website} style={[s.compSite, { color: brandAccent }]}>{comp.website}</Link>
                ) : (
                  <Text style={s.compSite}>—</Text>
                )}
              </View>
            ))}
          </>
        ) : null}

        {report.socials && report.socials.length ? (
          <>
            <Text style={[s.sectionTitle, { color: brandAccent, borderBottomColor: brandAccent }]}>Social Profiles</Text>
            {report.socials.map((soc, i) => (
              <View key={i} style={s.row}>
                <Text style={s.label}>{soc.type}</Text>
                <Link src={soc.url} style={[s.value, s.link, { color: brandAccent }]}>{soc.url}</Link>
              </View>
            ))}
          </>
        ) : null}

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Generated by AI Company Research Assistant  •  Model: ${report.model}  •  Page ${pageNumber}/${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

export async function renderReportPdf(report: Report): Promise<Buffer> {
  return renderToBuffer(<ReportDoc report={report} />);
}
