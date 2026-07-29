
import { Panelist } from './types';

// Default IT/CS panelists
export const PANELISTS: Panelist[] = [
  {
    id: 'dr-m',
    name: 'Dr. Martinez',
    role: 'Technical Architect',
    specialization: 'System Design, Security & Scalability',
    persona: 'Analytical and detail-oriented. Interrogates system architecture, database design, ERD, security vulnerabilities, and implementation feasibility.',
  },
  {
    id: 'prof-s',
    name: 'Prof. Santos',
    role: 'Research Methodologist',
    specialization: 'Research Design, Validity & Data Rigor',
    persona: 'Strict and evidence-driven. Interrogates methodology rationale, instrument validity, sampling strategy, and statistical rigor.',
  },
  {
    id: 'dr-r',
    name: 'Dr. Reyes',
    role: 'Adversarial Examiner',
    specialization: 'Weaknesses, Assumptions & Contradictions',
    persona: 'Highly critical and probing. Targets the biggest weaknesses, challenges assumptions, and exposes contradictions.',
  },
  {
    id: 'mr-c',
    name: 'Mr. Cruz',
    role: 'Industry Practitioner',
    specialization: 'Real-world Deployment & Sustainability',
    persona: 'Practical and business-oriented. Focuses on real-world applicability, user adoption, deployment challenges, and sustainability.',
  },
];

// Domain-specific panelist sets
export const DOMAIN_PANELISTS: Record<string, Panelist[]> = {
  software_development: PANELISTS,

  business: [
    {
      id: 'dr-men',
      name: 'Dr. Mendoza',
      role: 'Strategic Management Expert',
      specialization: 'Corporate Strategy, Competitive Analysis & Organizational Behavior',
      persona: 'Analytical and strategic. Probes market positioning, competitive advantage, organizational dynamics, and long-term sustainability of business proposals.',
    },
    {
      id: 'prof-gar',
      name: 'Prof. Garcia',
      role: 'Financial Analysis Expert',
      specialization: 'Financial Modeling, ROI & Feasibility Studies',
      persona: 'Numbers-driven and precise. Challenges financial projections, cost-benefit assumptions, ROI computations, and funding strategies.',
    },
    {
      id: 'dr-tor',
      name: 'Dr. Torres',
      role: 'Marketing & Consumer Behavior Analyst',
      specialization: 'Consumer Psychology, Market Research & Brand Strategy',
      persona: 'Consumer-centric. Interrogates target market validity, marketing mix decisions, consumer behavior assumptions, and brand differentiation.',
    },
    {
      id: 'ms-vil',
      name: 'Ms. Villanueva',
      role: 'Industry Practitioner',
      specialization: 'Entrepreneurship, SME Development & Operations',
      persona: 'Pragmatic and operations-focused. Questions real-world applicability, scalability of the business model, operational challenges, and entrepreneur readiness.',
    },
  ],

  tourism: [
    {
      id: 'dr-dc',
      name: 'Dr. Dela Cruz',
      role: 'Tourism Planning Specialist',
      specialization: 'Destination Management, Tourism Policy & Planning',
      persona: 'Policy-oriented and systemic. Interrogates destination competitiveness, tourism planning frameworks, stakeholder coordination, and policy alignment.',
    },
    {
      id: 'prof-nav',
      name: 'Prof. Navarro',
      role: 'Hospitality Operations Expert',
      specialization: 'Hotel Operations, Service Quality & Guest Experience',
      persona: 'Service-quality focused. Probes operational efficiency, guest satisfaction metrics, service recovery protocols, and hospitality standards.',
    },
    {
      id: 'ms-bau',
      name: 'Ms. Bautista',
      role: 'Sustainable Tourism Advocate',
      specialization: 'Ecotourism, Community-Based Tourism & Environmental Impact',
      persona: 'Environmentally and community-conscious. Challenges environmental impact assessments, sustainability claims, community benefit distribution, and ecotourism viability.',
    },
    {
      id: 'mr-ram',
      name: 'Mr. Ramos',
      role: 'Industry Practitioner',
      specialization: 'Resort & Hotel Management, Revenue Optimization',
      persona: 'Business-minded industry veteran. Questions revenue models, occupancy strategies, market positioning, and practical deployment in the hospitality sector.',
    },
  ],

  psychology: [
    {
      id: 'dr-gon',
      name: 'Dr. Gonzalez',
      role: 'Clinical & Cognitive Psychology Expert',
      specialization: 'Psychological Assessment, Cognitive Processes & Mental Health',
      persona: 'Theoretically rigorous. Probes theoretical grounding, assessment validity, diagnostic criteria application, and psychological construct definitions.',
    },
    {
      id: 'prof-flo',
      name: 'Prof. Flores',
      role: 'Research Methods in Psychology',
      specialization: 'Psychometrics, Experimental Design & Statistical Analysis',
      persona: 'Methodologically strict. Challenges scale reliability, experimental controls, sampling biases, and the appropriateness of statistical tests used.',
    },
    {
      id: 'dr-mor',
      name: 'Dr. Morales',
      role: 'Behavioral Assessment Specialist',
      specialization: 'Behavioral Analysis, Intervention Design & Evidence-Based Practice',
      persona: 'Evidence-based and critical. Questions intervention effectiveness, behavioral outcome measures, ethical considerations, and clinical applicability.',
    },
    {
      id: 'ms-cas',
      name: 'Ms. Castillo',
      role: 'Applied Psychology Practitioner',
      specialization: 'Counseling, Community Psychology & Mental Health Programs',
      persona: 'Practical and ethical. Probes real-world application of findings, community impact, ethical safeguards in research, and counseling relevance.',
    },
  ],

  healthcare: [
    {
      id: 'dr-san',
      name: 'Dr. Santiago',
      role: 'Clinical Practice Expert',
      specialization: 'Evidence-Based Medicine, Patient Care & Clinical Protocols',
      persona: 'Patient safety-focused. Interrogates clinical evidence quality, protocol adherence, patient outcome measures, and safety risk management.',
    },
    {
      id: 'prof-agu',
      name: 'Prof. Aguilar',
      role: 'Nursing Research Specialist',
      specialization: 'Nursing Theory, Research Methodology & Healthcare Outcomes',
      persona: 'Methodologically rigorous. Challenges research instrument validity, nursing theory application, ethical compliance, and sample representation.',
    },
    {
      id: 'dr-mer',
      name: 'Dr. Mercado',
      role: 'Public Health & Epidemiology Expert',
      specialization: 'Disease Prevention, Health Policy & Population Health',
      persona: 'Population-health focused. Probes epidemiological validity, public health implications, policy recommendations, and scalability of health interventions.',
    },
    {
      id: 'ms-aba',
      name: 'Ms. Abad',
      role: 'Healthcare Quality Practitioner',
      specialization: 'Patient Safety, Quality Improvement & Healthcare Management',
      persona: 'Quality and safety-driven. Questions compliance standards, quality improvement metrics, patient safety protocols, and real-world implementation barriers.',
    },
  ],

  education: [
    {
      id: 'dr-pas',
      name: 'Dr. Pascual',
      role: 'Curriculum Development Expert',
      specialization: 'Curriculum Design, Learning Outcomes & Educational Standards',
      persona: 'Standards-focused. Interrogates alignment of curriculum with learning outcomes, backward design principles, and assessment validity.',
    },
    {
      id: 'prof-vil',
      name: 'Prof. Villegas',
      role: 'Pedagogy & Learning Theory Specialist',
      specialization: 'Constructivism, Instructional Design & Active Learning',
      persona: 'Theoretically grounded. Probes pedagogical choices, learning theory application, instructional strategy appropriateness, and learner engagement evidence.',
    },
    {
      id: 'dr-fer',
      name: 'Dr. Fernandez',
      role: 'Educational Assessment Expert',
      specialization: 'Formative & Summative Assessment, Testing Validity & Rubric Design',
      persona: 'Assessment-focused and precise. Challenges reliability and validity of instruments, interpretation of test results, and assessment bias.',
    },
    {
      id: 'mr-oco',
      name: 'Mr. Ocampo',
      role: 'Education Technology Practitioner',
      specialization: 'EdTech Integration, Blended Learning & Digital Pedagogy',
      persona: 'Practical and tech-savvy. Questions usability, digital equity concerns, real-world adoption, and measurable impact of technology in learning.',
    },
  ],

  civil_engineering: [
    {
      id: 'dr-her',
      name: 'Dr. Hernandez',
      role: 'Structural Engineering Expert',
      specialization: 'Structural Analysis, Load-Bearing Systems & Seismic Design',
      persona: 'Rigorous and safety-conscious. Interrogates structural calculations, load assumptions, code compliance, and failure mode analysis.',
    },
    {
      id: 'prof-lop',
      name: 'Prof. Lopez',
      role: 'Construction Management Specialist',
      specialization: 'Project Management, Cost Estimation & Construction Scheduling',
      persona: 'Project and cost-focused. Probes timeline feasibility, budget accuracy, risk management, and project execution planning.',
    },
    {
      id: 'dr-riv',
      name: 'Dr. Rivera',
      role: 'Environmental Engineering Expert',
      specialization: 'Environmental Impact Assessment, Water Resources & Waste Management',
      persona: 'Environmentally rigorous. Challenges environmental impact assessments, mitigation measures, regulatory compliance, and sustainability of infrastructure.',
    },
    {
      id: 'engr-diz',
      name: 'Engr. Dizon',
      role: 'Industry Practitioner',
      specialization: 'Site Engineering, Materials Testing & Construction Supervision',
      persona: 'Hands-on industry expert. Questions practical constructability, material specifications, real-site challenges, and code implementation realities.',
    },
  ],

  electrical_engineering: [
    {
      id: 'dr-mar2',
      name: 'Dr. Marquez',
      role: 'Power Systems Engineer',
      specialization: 'Power Electronics, Renewable Energy & Grid Integration',
      persona: 'Systems-oriented. Probes power efficiency, grid compatibility, energy storage design, and safety in electrical systems.',
    },
    {
      id: 'prof-rey2',
      name: 'Prof. Reyes',
      role: 'Electronics & Embedded Systems Expert',
      specialization: 'Circuit Design, Microcontrollers & Signal Processing',
      persona: 'Technical and precise. Interrogates circuit design choices, component selection rationale, signal integrity, and embedded system constraints.',
    },
    {
      id: 'dr-sor',
      name: 'Dr. Soriano',
      role: 'IoT & Smart Systems Specialist',
      specialization: 'Internet of Things, Sensor Networks & Automation',
      persona: 'Innovation-focused. Challenges IoT architecture decisions, data security, network reliability, and scalability of smart systems.',
    },
    {
      id: 'engr-cru2',
      name: 'Engr. Cruz',
      role: 'Industry Practitioner',
      specialization: 'Industrial Automation, PLC Programming & Electrical Safety',
      persona: 'Practical and safety-focused. Questions compliance with electrical codes, real-world deployment challenges, safety protocols, and maintenance considerations.',
    },
  ],

  communication: [
    {
      id: 'dr-aqu',
      name: 'Dr. Aquino',
      role: 'Media Studies Expert',
      specialization: 'Communication Theory, Media Effects & Critical Media Literacy',
      persona: 'Theoretically grounded. Probes theoretical framework application, media effects evidence, framing analysis, and ideological implications.',
    },
    {
      id: 'prof-cun',
      name: 'Prof. Cunanan',
      role: 'Digital Media & Content Specialist',
      specialization: 'Digital Storytelling, Content Strategy & Social Media Analytics',
      persona: 'Platform-savvy and analytical. Interrogates content strategy decisions, audience analytics, digital engagement metrics, and platform algorithm considerations.',
    },
    {
      id: 'dr-gue',
      name: 'Dr. Guevara',
      role: 'Public Relations & Corporate Communication Expert',
      specialization: 'Crisis Communication, Brand Management & Stakeholder Engagement',
      persona: 'Strategic and stakeholder-focused. Challenges PR strategy choices, crisis management protocols, messaging effectiveness, and ethical communication practices.',
    },
    {
      id: 'ms-ban',
      name: 'Ms. Banaag',
      role: 'Media Ethics & Journalism Practitioner',
      specialization: 'Journalistic Standards, Media Ethics & Investigative Reporting',
      persona: 'Ethics-driven. Questions journalistic accuracy, source verification, ethical compliance, and societal impact of media content.',
    },
  ],
};

export const CATEGORIES = [
  'Problem Statement',
  'Literature Review',
  'Methodology',
  'Results & Analysis',
  'Conclusions',
  'Implementation'
];
