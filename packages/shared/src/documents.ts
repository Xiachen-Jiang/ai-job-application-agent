import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import PDFDocument from "pdfkit";
import type { MasterResumeContent } from "./schemas";

export async function masterResumeToDocx(resume: MasterResumeContent): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: resume.personal_info.name, bold: true, size: 32 })],
    })
  );

  const contact = [
    resume.personal_info.email,
    resume.personal_info.phone,
    resume.personal_info.location,
    resume.personal_info.linkedin,
    resume.personal_info.portfolio,
  ]
    .filter(Boolean)
    .join(" | ");

  if (contact) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(contact)] }));
  }

  if (resume.personal_info.summary) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Summary")] }));
    children.push(new Paragraph({ children: [new TextRun(resume.personal_info.summary)] }));
  }

  if (resume.skills.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Skills")] }));
    children.push(new Paragraph({ children: [new TextRun(resume.skills.join(", "))] }));
  }

  if (resume.experiences.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Experience")] }));
    for (const exp of resume.experiences) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${exp.title} — ${exp.company}`, bold: true }),
            new TextRun(` (${exp.start_date} – ${exp.end_date})`),
          ],
        })
      );
      for (const bullet of exp.bullets) {
        children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(bullet)] }));
      }
    }
  }

  if (resume.education.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Education")] }));
    for (const edu of resume.education) {
      children.push(
        new Paragraph({
          children: [new TextRun(`${edu.degree}, ${edu.institution} (${edu.graduation_date ?? ""})`)],
        })
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function coverLetterToDocx(content: string, company: string, role: string): Promise<Buffer> {
  const lines = content.split("\n").filter(Boolean);
  const children = [
    new Paragraph({ children: [new TextRun({ text: `Re: ${role} at ${company}`, bold: true })] }),
    ...lines.map((line) => new Paragraph({ children: [new TextRun(line)] })),
  ];
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function textToPdf(title: string, sections: { heading?: string; body: string }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(title, { align: "center" });
    doc.moveDown();

    for (const section of sections) {
      if (section.heading) {
        doc.fontSize(14).text(section.heading, { underline: true });
        doc.moveDown(0.5);
      }
      doc.fontSize(11).text(section.body);
      doc.moveDown();
    }

    doc.end();
  });
}

export async function masterResumeToPdf(resume: MasterResumeContent): Promise<Buffer> {
  const sections: { heading?: string; body: string }[] = [];

  if (resume.personal_info.summary) {
    sections.push({ heading: "Summary", body: resume.personal_info.summary });
  }
  sections.push({ heading: "Skills", body: resume.skills.join(", ") });

  const expBody = resume.experiences
    .map(
      (e) =>
        `${e.title} — ${e.company} (${e.start_date} – ${e.end_date})\n${e.bullets.map((b) => `• ${b}`).join("\n")}`
    )
    .join("\n\n");
  sections.push({ heading: "Experience", body: expBody });

  const eduBody = resume.education
    .map((e) => `${e.degree}, ${e.institution} (${e.graduation_date ?? ""})`)
    .join("\n");
  sections.push({ heading: "Education", body: eduBody });

  const contact = [resume.personal_info.email, resume.personal_info.phone, resume.personal_info.location]
    .filter(Boolean)
    .join(" | ");

  return textToPdf(`${resume.personal_info.name}\n${contact}`, sections);
}

export async function coverLetterToPdf(content: string, company: string, role: string): Promise<Buffer> {
  return textToPdf(`Cover Letter — ${role} at ${company}`, [{ body: content }]);
}
