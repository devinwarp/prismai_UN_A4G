"""Write kb/eval/questions.jsonl and kb/eval/query_vectors.json (C1-7).

Each question is written from a gate, an agent mandate or a gap row. Its gold
chunks are the chunks that contain a verbatim anchor phrase from the source:
chosen by reading the text, never from a retrieval ranking, so the evaluation
does not favour the retriever. Re-run after rebuilding the KB:
    python kb/eval/make_questions.py
Query vectors are written by scripts/embed_kb.ts (nomic-embed-text-v1.5, "search_query: " prefix).
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
KB = HERE.parent

# (area, question, anchor phrase that must appear verbatim in the gold chunk)
Q = [
    ("human_final_approval", "What must human oversight mechanisms be able to do to an agent's actions?", "effectively override, intercept or review agentic AI actions"),
    ("human_final_approval", "Which NIST activities cover appeal and override of an AI system?", "appeal and override, decommissioning, incident response"),
    ("human_final_approval", "What does the UAE AI Charter say about keeping people in control?", "6. Human Oversight"),
    ("human_final_approval", "Who must be held accountable when agents act, under Singapore's framework?", "Make humans meaningfully accountable"),
    ("audit_log", "What must be logged about everything an agent does in the Dubai architecture?", "Complete logging of all agent actions for compliance"),
    ("ai_disclosure", "How do people differ in interpreting an AI system's explanations?", "Humans perceive and derive meaning from AI system output and explanations in different ways"),
    ("audit_log", "What does the UAE cyber policy for AI expect after a security incident?", "robust incident response"),
    ("data_lawful", "Which UAE law bans handling personal data without the owner's agreement?", "prohibited to process Personal Data without the consent of its owner"),
    ("data_lawful", "What does the UAE data protection law require for sending personal data abroad?", "Personal Data may be transferred to outside of the State"),
    ("data_lawful", "Who can a data subject complain to about a violation of the personal data law?", "submit complaints to the Bureau"),
    ("ai_disclosure", "How does the UAE AI Charter describe transparency?", "5. Transparency"),
    ("recourse", "Why does an affected citizen need transparency about an AI output?", "Transparency is often necessary for actionable redress"),
    ("recourse", "How should people be able to challenge an AI system's result?", "report problems and appeal system outcomes"),
    ("high_risk", "Which EU high-risk area covers access to public benefits?", "essential private services and essential public services and benefits"),
    ("high_risk", "Which EU high-risk use covers asylum and visa applications?", "applications for asylum, visa or residence permits"),
    ("target", "What share of government does the Cabinet want to transform with agentic AI?", "transform 50% of government sectors, services, and operations"),
    ("target", "How long did the Cabinet give for the agentic AI transformation?", "defined timeline is two years"),
    ("target", "How many principal categories does Phase One of the agentic project cover?", "covering 4 principal categories"),
    ("hosting", "What must a Dubai government entity check about its cloud provider's compliance?", "periodic reviews or audits to verify cloud service provider"),
    ("matrix", "How does Digital Dubai classify AI use cases?", "four strategic quadrants"),
    ("matrix", "What governance bodies does the Dubai framework describe?", "AI Steering Committee AI Program Office Quadrant Working Groups Ethics and Compliance Board"),
    ("matrix", "Which Dubai programme certifies technology companies for the agentic accelerator?", "certified under the Dubai AI Seal"),
    ("sandbox", "What will the Dubai AI Sandbox let regulators and innovators do?", "innovators and regulators to work together"),
    ("y3172", "What does the policy node do in the Y.3172 machine learning pipeline?", "enables the application of policies to the output of the model node"),
    ("y3172", "Which Y.3172 node manages and orchestrates the other nodes?", "manage and orchestrate the nodes in a machine"),
    ("y3172", "How does Y.3172 define a machine learning sandbox?", "machine learning sandbox: An environment in which machine learning models can be trained"),
    ("hosting", "Which part of the Dubai information security regulation covers cloud computing risk?", "To set controls for mitigating risks associated with cloud computing"),
    ("readiness", "Which AI readiness dimension mentions detecting hallucination?", "ability to detect hallucination"),
    ("readiness", "What does the AI Policy dimension evaluate?", "evaluates the maturity of institutional frameworks essential for trustworthy"),
    ("security", "Which UAE policy sets AI monitoring and response requirements?", "AI Monitoring & Response Requirements"),
    # Added 19 Nov 2026 for the sources ingested that day (English), written from the excerpt text.
    ("recourse", "What right does GDPR give people against decisions made only by automated processing?", "right not to be subject to a decision based solely on automated processing"),
    ("recourse", "What safeguards must a controller provide when an automated decision is allowed under GDPR?", "right to obtain human intervention on the part of the controller"),
    ("audit_log", "What must high-risk AI systems technically allow for under the EU AI Act's record-keeping article?", "automatic recording of events (logs) over the lifetime of the system"),
    ("audit_log", "What must the logs of a remote biometric identification system record about each use?", "recording of the period of each use of the system"),
    ("inclusion", "Which EU AI Act provision requires high-risk systems to meet accessibility requirements?", "complies with accessibility requirements in accordance with Directives"),
    ("energy", "What does the EU AI Act say voluntary codes of conduct can do about the energy use of AI?", "energy-efficient programming and techniques"),
    ("energy", "What energy information must general-purpose model providers document under the EU AI Act?", "known or estimated energy consumption of the model"),
    ("inclusion", "What does WCAG 2.2 define?", "how to make web content more accessible to people with disabilities"),
    ("global_south", "What approach does the African Union's Continental AI Strategy propose?", "people-centric, development-oriented and inclusive approach"),
    ("global_south", "What does the African Union strategy say about regulatory standards for public procurement of AI?", "regulatory standards for the public procurement of AI systems"),
    ("energy", "What environmental risk of AI does the African Union strategy identify?", "contribute to increased CO2 emissions"),
    ("global_south", "What does India's AI governance guidance say about who should have final control over AI systems?", "have final control over AI systems"),
    ("recourse", "What grievance mechanism does the Indian guidance recommend for organisations deploying AI?", "accessible and effective grievance redressal mechanisms"),
    ("human_final_approval", "When does the Indian guidance say direct human oversight is ineffective?", "direct human oversight is ineffective"),
]


# Held-out set (written before any retrieval tuning, never used to choose settings):
# it is run once, at the end, to check that the chosen configuration generalises.
HELD = [
    ("target", "What data-sharing principle did the Cabinet adopt for government services?", "collecting data once and using it securely across entities"),
    ("hosting", "Which control covers registering and removing users in the Dubai regulation?", "Defines and implements a process for users registration"),
    ("matrix", "What is the first maturity level in the Dubai framework?", "Level 1: Initial Awareness"),
    ("charter", "What does the UAE Charter say about safety standards for AI?", "comply with the highest safety standards"),
    ("target", "Which council did the Cabinet reconstitute on 18 May?", "reconstitution of the UAE Council for Digital Wellbeing"),
    ("security", "What areas does the UAE national cyber policy for AI cover?", "algorithm protection, operational safety, threat monitoring"),
    ("y3172", "What does Y.3172 recommend for data from several sources?", "support the correlation of data coming from multiple sources"),
    ("high_risk", "What does NIST GOVERN 1.1 say about legal and regulatory requirements?", "Legal and regulatory requirements involving AI are understood, managed, and documented"),
    ("human_final_approval", "What is the fourth dimension of Singapore's agentic framework?", "enabling end-user responsibility"),
    ("high_risk", "Which EU high-risk area covers remote biometric identification?", "biometric identification means the automated recognition"),
    ("matrix", "Who organises the Dubai agentic AI accelerator?", "Organised by Dubai Centre for Artificial Intelligence"),
    ("hosting", "Who owns the Dubai Information Security Regulation?", "Information Security Regulation belongs to Dubai Government"),
    ("target", "Who will oversee implementation of the agentic project?", "will oversee the implementation"),
    ("sandbox", "What wider approach does the Dubai AI Sandbox build on?", "wider approach to regulatory modernisation"),
    # Added 19 Nov 2026, written before the new corpus was embedded or scored.
    ("recourse", "Under GDPR, which contexts allow automated decisions by law with safeguards for rights?", "is authorised by Union or Member State law to which the controller is subject"),
    ("audit_log", "Which identification of people must a high-risk biometric system's logs include?", "identification of the natural persons involved in the verification of the results"),
    ("inclusion", "What does the EU AI Act say voluntary codes should do for vulnerable people and disability?", "accessibility for persons with a disability"),
    ("inclusion", "What does the EU AI Act say about diverse development teams?", "inclusive and diverse development teams"),
    ("inclusion", "Which divide does the African Union strategy say AI could widen for women and youth?", "gender digital divide"),
    ("sandbox", "What does India recommend regulatory sandboxes afford to testers?", "reasonable legal immunities"),
    ("ai_disclosure", "What does India say understandability should be in AI design?", "core design feature, not an afterthought"),
    ("energy", "What does Indian guidance ask of systems regarding sustainability?", "environmentally sustainable"),
]

# Arabic questions (lang "ar"); gold is the English chunk that answers them, so these test
# cross-lingual retrieval. Reported separately: BM25 cannot match Arabic against an English corpus.
AR_Q = [
    ("human_final_approval", "ما الذي يجب أن تتيحه آليات الإشراف البشري على إجراءات الوكيل؟", "effectively override, intercept or review agentic AI actions"),
    ("recourse", "ما حق الأشخاص ضد القرارات المتخذة بالمعالجة الآلية وحدها بموجب اللائحة الأوروبية لحماية البيانات؟", "right not to be subject to a decision based solely on automated processing"),
    ("audit_log", "ما الذي يجب أن تسجله أنظمة الذكاء الاصطناعي عالية المخاطر وفق قانون الذكاء الاصطناعي الأوروبي؟", "automatic recording of events (logs) over the lifetime of the system"),
    ("target", "ما النسبة المستهدفة من القطاعات الحكومية للتحول إلى الذكاء الاصطناعي الوكيل في الإمارات؟", "transform 50% of government sectors, services, and operations"),
    ("data_lawful", "ما الذي يشترطه قانون حماية البيانات الشخصية الإماراتي لنقل البيانات إلى الخارج؟", "Personal Data may be transferred to outside of the State"),
    ("global_south", "ما النهج الذي تقترحه استراتيجية الاتحاد الأفريقي القارية للذكاء الاصطناعي؟", "people-centric, development-oriented and inclusive approach"),
]
AR_HELD = [
    ("human_final_approval", "كيف يصف ميثاق الإمارات للذكاء الاصطناعي مبدأ الإشراف البشري؟", "6. Human Oversight"),
    ("recourse", "ما آلية التظلم التي توصي بها الهند للجهات التي تنشر أنظمة الذكاء الاصطناعي؟", "accessible and effective grievance redressal mechanisms"),
    ("energy", "ما المعلومات المطلوبة عن استهلاك الطاقة من مزودي نماذج الذكاء الاصطناعي ذات الأغراض العامة؟", "known or estimated energy consumption of the model"),
    ("data_lawful", "إلى من يمكن لصاحب البيانات تقديم شكوى بشأن مخالفة قانون البيانات الشخصية؟", "submit complaints to the Bureau"),
]



def norm(s: str) -> str:
    return " ".join(s.lower().split())


def rows_for(chunks, qs, prefix, lang=None):
    rows = []
    for area, q, phrase in qs:
        gold = [c["chunk_id"] for c in chunks if norm(phrase) in norm(c["text"])]
        if not gold:
            sys.exit(f"anchor not found in any chunk: {phrase!r}")
        rows.append({"id": f"{prefix}{len(rows) + 1:02d}", "area": area, "question": q, "anchor": phrase, "gold": gold, **({"lang": lang} if lang else {})})
    return rows


def main():
    chunks = json.loads((KB / "chunks.json").read_text(encoding="utf-8"))
    tune = rows_for(chunks, Q, "Q") + rows_for(chunks, AR_Q, "QA", "ar")
    held = rows_for(chunks, HELD, "H") + rows_for(chunks, AR_HELD, "HA", "ar")
    for name, rows in (("questions.jsonl", tune), ("heldout.jsonl", held)):
        (HERE / name).write_text(chr(10).join(json.dumps(r, ensure_ascii=False) for r in rows) + chr(10), encoding="utf-8")
        print(name, len(rows), "questions; gold chunks per question:", [len(r["gold"]) for r in rows])
    print("now run: node scripts/embed_kb.ts   (writes kb/vectors.json and kb/eval/query_vectors.json)")


if __name__ == "__main__":
    main()
