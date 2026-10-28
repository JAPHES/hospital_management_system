import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');
const knowledgeDir = path.join(projectRoot, 'knowledge');

// Ensure knowledge directory exists
if (!fs.existsSync(knowledgeDir)) {
  fs.mkdirSync(knowledgeDir, { recursive: true });
}

function createPdf(filename: string, title: string, content: { section: string; text: string }[]) {
  const doc = new PDFDocument({ margin: 50 });
  const filePath = path.join(knowledgeDir, filename);
  doc.pipe(fs.createWriteStream(filePath));

  // Title
  doc.fontSize(24).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.moveDown(2);

  // Content
  for (const item of content) {
    doc.fontSize(16).font('Helvetica-Bold').text(item.section);
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').text(item.text, { align: 'justify', lineGap: 4 });
    doc.moveDown(1.5);
  }

  doc.end();
  console.log(`Generated: ${filePath}`);
}

// Generate the PDFs
console.log('Generating medical guides in PDF format...');

createPdf('hospital_policies.pdf', 'Taita Taveta University Health Unit - General Policies & Visitor Guide', [
  {
    section: 'Visiting Hours',
    text: 'The Taita Taveta University Health Unit is open to patients and visitors 24 hours a day, 7 days a week. No more than two visitors are allowed per patient at one time to ensure quiet recovery.',
  },
  {
    section: 'Emergency Services',
    text: 'The Emergency Room (ER) is open 24/7. Patients are triaged based on medical urgency. Standard wait times for non-life-threatening conditions range from 15 to 45 minutes, depending on patient volume. Patients with critical emergencies are seen immediately.',
  },
  {
    section: 'Parking Guidelines',
    text: 'Visitor parking is available in the main garage directly opposite the hospital entrance. Parking is free for the first 30 minutes, and costs $2.00 per hour thereafter, up to a daily maximum of $15.00. Validation is available for immediate family members of long-term patients.',
  },
  {
    section: 'Code of Conduct',
    text: 'Taita Taveta University Health Unit is committed to providing a safe, clean, and respectful environment. Violence, abusive language, or disruptive behavior towards staff or other patients will result in immediate removal by security and potential legal actions.',
  },
]);

createPdf('cardiology_guide.pdf', 'Cardiovascular Health & Patient Guide', [
  {
    section: 'Welcome to Cardiology',
    text: 'Our cardiology department provides state-of-the-art care for heart-related conditions, including hypertension, coronary artery disease, arrhythmias, and heart failure. We focus on both preventive heart care and active diagnostic treatment.',
  },
  {
    section: 'Preparing for Your Visit',
    text: 'Please bring a complete list of your current medications, recent blood test results, and a log of symptoms you have been experiencing. Do not consume caffeine or perform strenuous exercise 4 hours prior to a scheduled stress test.',
  },
  {
    section: 'Heart-Healthy Habits',
    text: 'To maintain cardiovascular health, aim for at least 150 minutes of moderate-intensity aerobic exercise per week. Follow a diet low in sodium and saturated fats, rich in vegetables, fruits, whole grains, and lean proteins. Quit smoking and limit alcohol intake.',
  },
  {
    section: 'Common Diagnostic Tests',
    text: 'Electrocardiogram (ECG/EKG) measures electrical activity of the heart to identify arrhythmias. Echocardiogram uses ultrasound waves to produce live images of heart chambers and valves. Stress test monitors heart function under physical exertion on a treadmill.',
  },
]);

createPdf('pediatrics_faq.pdf', 'Pediatric Care & Child Wellness FAQ', [
  {
    section: 'General Child Wellness',
    text: 'Regular pediatric check-ups are essential for tracking growth, development, and administering standard vaccinations. Scheduled wellness visits occur at 1, 2, 4, 6, 9, 12, 15, and 18 months, and annually thereafter. Feel free to discuss development questions with your pediatrician.',
  },
  {
    section: 'Immunization Schedule',
    text: 'Standard immunizations include DTaP, MMR, Varicella, Hepatitis B, and Hib. Flu shots are recommended annually for children 6 months and older. If you miss a scheduled vaccine, consult your pediatrician for a catch-up plan to ensure full protection.',
  },
  {
    section: 'Managing Common Fevers',
    text: 'A fever is defined as a temperature of 100.4F (38C) or higher. For infants under 3 months, contact a doctor immediately for any fever. For older children, ensure they stay hydrated, and use acetaminophen or ibuprofen as directed. Never give aspirin to children due to the risk of Reye\'s syndrome.',
  },
  {
    section: 'Pediatric Emergencies',
    text: 'Seek emergency care if your child has difficulty breathing, severe dehydration (no wet diapers for 8+ hours), extreme lethargy, or a fever accompanied by a stiff neck or purple rash. Trust your parental instincts when deciding to visit the ER.',
  },
]);

createPdf('diabetes_management.pdf', 'Patient Diabetes Care & Nutrition Guide', [
  {
    section: 'Understanding Diabetes',
    text: 'Diabetes is a chronic condition affecting how the body turns food into energy. Type 1 diabetes is an autoimmune condition where the body stops producing insulin. Type 2 diabetes occurs when the body becomes resistant to insulin and struggles to produce enough.',
  },
  {
    section: 'Blood Sugar Monitoring',
    text: 'Routinely check blood glucose levels using a glucometer or continuous glucose monitor (CGM). Target pre-meal glucose ranges should be 80-130 mg/dL, and post-meal (1-2 hours after) should be below 180 mg/dL. Keep records of your levels for your endocrinologist.',
  },
  {
    section: 'Nutrition Guidelines',
    text: 'Focus on complex carbohydrates (whole grains, oats) rather than simple sugars. Monitor portion sizes, limit sugary beverages, and fill half your plate with non-starchy vegetables (spinach, broccoli). Fiber helps slow sugar absorption and stabilizes levels.',
  },
  {
    section: 'Insulin Storage & Use',
    text: 'Keep unopened insulin in the refrigerator. Open vials or pens can be kept at room temperature but must be discarded after 28 days. Avoid extreme temperatures (direct sunlight or freezing) as it ruins the effectiveness.',
  },
]);

console.log('PDF generation complete!');
