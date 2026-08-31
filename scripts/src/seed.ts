import { db, audiencesTable, categoriesTable, recipesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const categoryData = [
  ["Career", "career", "Practical workflows for finding work and growing your career."],
  ["Education", "education", "Study aids that help you understand, remember, and revise."],
  ["Business", "business", "Simple systems for selling, serving, and operating a small business."],
  ["Productivity", "productivity", "Everyday workflows that make work clearer and lighter."],
  ["Content", "content", "Repeatable systems for creating useful content consistently."],
  ["Personal", "personal", "Thoughtful workflows for communication and everyday life."],
] as const;

const audienceData = [
  ["Students", "students", "For school, college, exam, and self-directed learners."],
  ["Job Seekers", "job-seekers", "For freshers and professionals looking for their next role."],
  ["Employees", "employees", "For people who want to communicate and work better."],
  ["Business Owners", "business-owners", "For local shops, founders, and small teams."],
  ["Freelancers", "freelancers", "For independent professionals managing clients and delivery."],
  ["Creators", "creators", "For people making content for an audience."],
  ["General Users", "general-users", "Useful workflows for anyone."],
] as const;

type RecipeSeed = {
  title: string;
  category: string;
  audience: string;
  subcategory: string;
  difficulty: string;
  time: string;
  description: string;
  problem: string;
  tags: string[];
  tools: string[];
};

const recipes: RecipeSeed[] = [
  { title: "Improve a Resume for an Indian Fresher", category: "Career", audience: "Job Seekers", subcategory: "Resume", difficulty: "Beginner", time: "15 min", description: "Turn scattered education and project details into clear, evidence-led resume bullets.", problem: "A fresher resume often lists responsibilities without showing what the person actually did or learned.", tags: ["resume", "fresher", "jobs"], tools: ["ChatGPT", "Gemini", "Claude"] },
  { title: "Analyze an Indian Job Description", category: "Career", audience: "Job Seekers", subcategory: "Job Search", difficulty: "Beginner", time: "10 min", description: "See the skills, signals, and hidden priorities inside a job description before applying.", problem: "Job descriptions can be long and vague, making it difficult to judge fit or tailor an application.", tags: ["job search", "skills", "career"], tools: ["ChatGPT", "Gemini"] },
  { title: "Prepare for an HR Interview", category: "Career", audience: "Job Seekers", subcategory: "Interviews", difficulty: "Beginner", time: "20 min", description: "Practice grounded answers for common HR questions without sounding rehearsed.", problem: "Candidates know their experience but struggle to explain it with confidence and structure.", tags: ["interview", "hr", "freshers"], tools: ["ChatGPT", "Claude"] },
  { title: "Prepare for a Technical Interview", category: "Career", audience: "Job Seekers", subcategory: "Interviews", difficulty: "Intermediate", time: "30 min", description: "Create a realistic technical interview loop from a role and your current level.", problem: "Generic question lists do not reveal the gaps most likely to matter for a specific role.", tags: ["technical interview", "practice", "coding"], tools: ["ChatGPT", "Gemini"] },
  { title: "Turn Internship Work into Resume Bullets", category: "Career", audience: "Job Seekers", subcategory: "Resume", difficulty: "Beginner", time: "15 min", description: "Translate everyday internship work into specific, credible accomplishments.", problem: "Useful work gets undersold when it is written as a list of routine tasks.", tags: ["internship", "resume", "writing"], tools: ["ChatGPT", "Claude"] },
  { title: "Write a Tailored Cover Letter", category: "Career", audience: "Job Seekers", subcategory: "Job Search", difficulty: "Beginner", time: "15 min", description: "Draft a short cover letter that connects your evidence to one role.", problem: "Cover letters often become generic summaries instead of a clear reason for the match.", tags: ["cover letter", "applications", "career"], tools: ["ChatGPT", "Gemini"] },
  { title: "Plan a 30-Day Job Search", category: "Career", audience: "Job Seekers", subcategory: "Job Search", difficulty: "Intermediate", time: "20 min", description: "Build a sustainable weekly rhythm for applications, outreach, and interview practice.", problem: "Unstructured job searching creates bursts of activity followed by discouragement.", tags: ["job search", "planning", "career"], tools: ["ChatGPT", "Claude"] },
  { title: "Write a Professional Follow-up Email", category: "Career", audience: "Employees", subcategory: "Workplace", difficulty: "Beginner", time: "5 min", description: "Follow up after an interview or introduction without sounding pushy.", problem: "The right follow-up is useful but difficult to make concise and specific.", tags: ["email", "follow up", "workplace"], tools: ["ChatGPT", "Gemini"] },
  { title: "Turn a Textbook Chapter into Revision Notes", category: "Education", audience: "Students", subcategory: "Study", difficulty: "Beginner", time: "15 min", description: "Compress a chapter into structured notes that are easy to revise.", problem: "Highlighting everything creates long notes that are not useful close to an exam.", tags: ["notes", "revision", "study"], tools: ["ChatGPT", "NotebookLM"] },
  { title: "Create Viva Questions from a Topic", category: "Education", audience: "Students", subcategory: "Exams", difficulty: "Beginner", time: "10 min", description: "Generate oral-exam questions with follow-ups and model answer outlines.", problem: "Reading notes silently does not prepare you for explaining concepts aloud.", tags: ["viva", "exams", "practice"], tools: ["ChatGPT", "Gemini"] },
  { title: "Explain a Difficult Topic Simply", category: "Education", audience: "Students", subcategory: "Study", difficulty: "Beginner", time: "10 min", description: "Ask for an explanation that matches your current understanding and language comfort.", problem: "A textbook explanation can be technically correct but still fail to make the idea click.", tags: ["learning", "concepts", "students"], tools: ["ChatGPT", "Claude"] },
  { title: "Create an Exam Study Plan", category: "Education", audience: "Students", subcategory: "Planning", difficulty: "Beginner", time: "15 min", description: "Make a realistic revision plan around dates, confidence, and available hours.", problem: "Study plans fail when they treat every subject as equally urgent or easy.", tags: ["study plan", "exams", "planning"], tools: ["ChatGPT", "Gemini"] },
  { title: "Convert a Lecture Transcript into Notes", category: "Education", audience: "Students", subcategory: "Notes", difficulty: "Beginner", time: "15 min", description: "Turn a messy transcript into headings, key ideas, and questions to revisit.", problem: "Lecture recordings are valuable but difficult to review efficiently.", tags: ["transcript", "notes", "learning"], tools: ["ChatGPT", "NotebookLM"] },
  { title: "Build Practice Questions with Answers", category: "Education", audience: "Students", subcategory: "Exams", difficulty: "Intermediate", time: "20 min", description: "Create mixed-difficulty questions from your own material and check understanding.", problem: "Students often mistake familiarity with notes for actual recall.", tags: ["practice", "active recall", "exams"], tools: ["ChatGPT", "Gemini"] },
  { title: "Write Customer WhatsApp Replies", category: "Business", audience: "Business Owners", subcategory: "Customer Support", difficulty: "Beginner", time: "5 min", description: "Turn a rough thought into a warm, clear reply that preserves your voice.", problem: "Fast customer replies can sound abrupt, unclear, or accidentally overpromise.", tags: ["whatsapp", "customers", "small business"], tools: ["ChatGPT", "Gemini"] },
  { title: "Create a Local Business Offer", category: "Business", audience: "Business Owners", subcategory: "Marketing", difficulty: "Beginner", time: "15 min", description: "Shape a seasonal or neighbourhood offer with a clear reason to act.", problem: "Discounts without a clear audience or deadline rarely create useful demand.", tags: ["offer", "marketing", "local business"], tools: ["ChatGPT", "Claude"] },
  { title: "Respond to a Negative Review", category: "Business", audience: "Business Owners", subcategory: "Customer Support", difficulty: "Beginner", time: "10 min", description: "Acknowledge the experience, avoid defensiveness, and invite a real resolution.", problem: "A public reply must protect trust without arguing with the customer.", tags: ["reviews", "reputation", "customers"], tools: ["ChatGPT", "Gemini"] },
  { title: "Write a Product Description", category: "Business", audience: "Business Owners", subcategory: "Marketing", difficulty: "Beginner", time: "10 min", description: "Describe what a product helps someone do in language customers actually use.", problem: "Feature-heavy copy makes products harder to understand and compare.", tags: ["product copy", "ecommerce", "marketing"], tools: ["ChatGPT", "Claude"] },
  { title: "Create a Festival Promotion", category: "Business", audience: "Business Owners", subcategory: "Marketing", difficulty: "Beginner", time: "20 min", description: "Plan a respectful, timely festival campaign across WhatsApp and social.", problem: "Festival campaigns become forgettable when they copy generic greetings without a useful offer.", tags: ["festival", "promotion", "content"], tools: ["ChatGPT", "Gemini"] },
  { title: "Turn Customer Questions into an FAQ", category: "Business", audience: "Business Owners", subcategory: "Operations", difficulty: "Intermediate", time: "20 min", description: "Find repeat questions in chats and turn them into clear answers your team can reuse.", problem: "Teams lose time answering the same questions in slightly different ways.", tags: ["faq", "operations", "support"], tools: ["ChatGPT", "Claude"] },
  { title: "Turn Meeting Notes into Action Items", category: "Productivity", audience: "Employees", subcategory: "Meetings", difficulty: "Beginner", time: "5 min", description: "Extract owners, decisions, and next steps from messy meeting notes.", problem: "Meetings lose value when decisions and ownership disappear into a document.", tags: ["meetings", "action items", "work"], tools: ["ChatGPT", "Gemini"] },
  { title: "Write a Clear Professional Email", category: "Productivity", audience: "Employees", subcategory: "Email", difficulty: "Beginner", time: "5 min", description: "Turn context and intent into a concise email with an obvious ask.", problem: "Long, indirect emails create more back-and-forth than the original task.", tags: ["email", "workplace", "writing"], tools: ["ChatGPT", "Claude"] },
  { title: "Summarize a Long Document", category: "Productivity", audience: "Employees", subcategory: "Research", difficulty: "Beginner", time: "15 min", description: "Get a layered summary that separates facts, decisions, and open questions.", problem: "A single summary length does not work for every decision or reader.", tags: ["summary", "documents", "research"], tools: ["ChatGPT", "NotebookLM"] },
  { title: "Create a Presentation Outline", category: "Productivity", audience: "Employees", subcategory: "Planning", difficulty: "Beginner", time: "15 min", description: "Build a story-first outline before spending time on slides.", problem: "Slides become crowded when the message and audience decision are unclear.", tags: ["presentations", "slides", "storytelling"], tools: ["ChatGPT", "Gemini"] },
  { title: "Analyze Spreadsheet Data", category: "Productivity", audience: "Employees", subcategory: "Research", difficulty: "Intermediate", time: "20 min", description: "Ask better questions of a spreadsheet and surface anomalies worth checking.", problem: "A spreadsheet can answer questions only after someone frames the analysis clearly.", tags: ["spreadsheets", "analysis", "data"], tools: ["ChatGPT", "Claude"] },
  { title: "Create a YouTube Video Structure", category: "Content", audience: "Creators", subcategory: "YouTube", difficulty: "Beginner", time: "20 min", description: "Turn an idea into a watchable structure with a clear promise and payoff.", problem: "Good ideas lose viewers when the opening and progression are not intentional.", tags: ["youtube", "video", "creator"], tools: ["ChatGPT", "Gemini"] },
  { title: "Write a Short-form Video Script", category: "Content", audience: "Creators", subcategory: "Instagram", difficulty: "Beginner", time: "15 min", description: "Draft a natural 30–60 second script with a strong first line.", problem: "Short videos need structure even when they are meant to feel casual.", tags: ["reels", "shorts", "script"], tools: ["ChatGPT", "Claude"] },
  { title: "Write an Instagram Caption", category: "Content", audience: "Creators", subcategory: "Instagram", difficulty: "Beginner", time: "5 min", description: "Create a caption that adds context and earns a meaningful response.", problem: "Captions often repeat the visual instead of giving the audience a reason to care.", tags: ["instagram", "caption", "social media"], tools: ["ChatGPT", "Gemini"] },
  { title: "Turn a Messy WhatsApp Message into a Professional Message", category: "Personal", audience: "General Users", subcategory: "Communication", difficulty: "Beginner", time: "5 min", description: "Preserve the meaning of a rough message while making it clear, polite, and ready to send.", problem: "Important messages written quickly on a phone can sound harsher or more confusing than intended.", tags: ["whatsapp", "communication", "writing"], tools: ["ChatGPT", "Gemini", "Claude"] },
  { title: "Plan a Practical Weekend Trip", category: "Personal", audience: "General Users", subcategory: "Travel", difficulty: "Beginner", time: "15 min", description: "Shape a realistic itinerary around budget, pace, and what you actually enjoy.", problem: "Travel plans become exhausting when they optimize for seeing everything instead of having a good day.", tags: ["travel", "planning", "itinerary"], tools: ["ChatGPT", "Gemini"] },
];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function promptFor(recipe: RecipeSeed) {
  return `You are helping with this real-world task: ${recipe.title}.\n\nContext: ${recipe.problem}\n\nUse the inputs below to create a useful first draft. Preserve the user's meaning and facts. Do not invent numbers, names, qualifications, dates, or claims. Ask one clarifying question only when a missing detail would materially change the result.\n\nInputs:\n- Goal and audience\n- Relevant source material\n- Constraints, tone, and length\n\nReturn:\n1. A polished result ready for review\n2. A short list of assumptions\n3. Two options if tone or direction is ambiguous`;
}

async function main() {
  for (const [name, slug, description] of categoryData) {
    await db.insert(categoriesTable).values({ name, slug, description }).onConflictDoNothing();
  }
  for (const [name, slug, description] of audienceData) {
    await db.insert(audiencesTable).values({ name, slug, description }).onConflictDoNothing();
  }
  const categoryRows = await db.select().from(categoriesTable);
  const audienceRows = await db.select().from(audiencesTable);
  for (const item of recipes) {
    const category = categoryRows.find((row) => row.name === item.category);
    const audience = audienceRows.find((row) => row.name === item.audience);
    if (!category || !audience) continue;
    const slug = slugify(item.title);
    const existing = await db.select({ id: recipesTable.id }).from(recipesTable).where(eq(recipesTable.slug, slug));
    if (existing.length > 0) continue;
    await db.insert(recipesTable).values({
      title: item.title,
      slug,
      shortDescription: item.description,
      problem: item.problem,
      categoryId: category.id,
      audienceId: audience.id,
      subcategory: item.subcategory,
      difficulty: item.difficulty,
      estimatedTime: item.time,
      language: "English",
      aiTools: item.tools,
      requiredInputs: ["Your goal and audience", "Relevant source material", "Constraints, tone, and length"],
      steps: ["Describe the problem and paste the relevant context.", "Ask the AI to preserve facts and label assumptions.", "Review the result against the verification checklist before using it."],
      prompt: promptFor(item),
      exampleInput: `Goal: ${item.title}. Audience: a busy person in India. Constraint: keep the result practical and specific.`,
      exampleOutput: `A clear first draft for ${item.title.toLowerCase()}, with assumptions called out for review.`,
      refinementPrompts: ["Make it more concise without removing important context.", "Give me two alternatives with different tones.", "List anything I should verify before using this."],
      verificationNotes: "Check every name, date, number, claim, and recommendation. AI should improve your draft, not invent facts.",
      tags: item.tags,
      status: "PUBLISHED",
      featured: item.title.includes("WhatsApp") || item.title.includes("Resume"),
      trending: item.title.includes("Interview") || item.title.includes("Meeting"),
      recipeOfDay: item.title === "Turn a Messy WhatsApp Message into a Professional Message",
      version: "1.0",
      testedAt: "2026-08-01",
      testedWith: item.tools,
      seoTitle: `${item.title} | AI Recipes`,
      seoDescription: item.description,
      publishedAt: new Date(),
    });
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));