#!/usr/bin/env bash
# Fresh model-driven pilot then goal judge, to fill the cost ledger (offline UC02, server on :3100). Local use only.
set -u
UC=$(cat .data/uc02.id); B=http://localhost:3100/api/admin/un/use-cases/$UC; J='Content-Type: application/json'
P='Fee and Payment Officer'
echo "pilot start $(date +%T)"
curl -s --max-time 1500 -X POST $B/pilot -H "$J" -d "{\"profile\":\"$P\",\"agent\":\"llm\"}" > .data/pilot-out.json
python -c "import json;d=json.load(open('.data/pilot-out.json'));print({k:(d.get(k) if not isinstance(d.get(k),(dict,list)) else '...') for k in d});print(d.get('id') or d.get('pilot_id'))"
echo "pilot end $(date +%T)"
