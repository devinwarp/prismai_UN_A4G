"""Write kb/eval/questions.jsonl and kb/eval/query_vectors.json (C1-7).

Each question is written from a gate, an agent mandate or a gap row. Its gold
chunks are the chunks that contain a verbatim anchor phrase from the source:
chosen by reading the text, never from a retrieval ranking, so the evaluation
does not favour the retriever. Re-run after rebuilding the KB:
    .venv/Scripts/python kb/eval/make_questions.py
Query vectors come from Ollama nomic-embed-text with the "search_query: " prefix.
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
    ("data_lawful", "Which UAE law bans handling personal data without the owner's agreement?", "prohibits the processing of personal data without the consent of its owner"),
    ("data_lawful", "What does the UAE data protection law require for sending personal data abroad?", "requirements for the cross-border transfer and sharing of personal data"),
    ("data_lawful", "Who prepares the systems for complaints about personal data?", "preparing systems for complaints and grievances related to data"),
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
]


def norm(s: str) -> str:
    return " ".join(s.lower().split())


def rows_for(chunks, qs, prefix):
    rows = []
    for area, q, phrase in qs:
        gold = [c["chunk_id"] for c in chunks if norm(phrase) in norm(c["text"])]
        if not gold:
            sys.exit(f"anchor not found in any chunk: {phrase!r}")
        rows.append({"id": f"{prefix}{len(rows) + 1:02d}", "area": area, "question": q, "anchor": phrase, "gold": gold})
    return rows


def main():
    chunks = json.loads((KB / "chunks.json").read_text(encoding="utf-8"))
    tune = rows_for(chunks, Q, "Q")
    held = rows_for(chunks, HELD, "H")
    for name, rows in (("questions.jsonl", tune), ("heldout.jsonl", held)):
        (HERE / name).write_text(chr(10).join(json.dumps(r, ensure_ascii=False) for r in rows) + chr(10), encoding="utf-8")
        print(name, len(rows), "questions; gold chunks per question:", [len(r["gold"]) for r in rows])
    import ollama  # needs the local Ollama server with nomic-embed-text
    vecs = {r["id"]: [round(float(x), 5) for x in ollama.embed(model="nomic-embed-text", input="search_query: " + r["question"])["embeddings"][0]] for r in tune + held}
    (HERE / "query_vectors.json").write_text(json.dumps({"model": "nomic-embed-text", "prefix": "search_query: ", "vectors": vecs}), encoding="utf-8")
    print("wrote query_vectors.json")


if __name__ == "__main__":
    main()
