#!/bin/bash
# Take C — Run Summary › Group Run tab open on "2 of 5 finished · updating live"; the other three
# runners' saved runs are linked to the group one by one through the real POST /complete, and the
# app picks each up on its own 15 s poll. Then the AI group debrief.
#   take-c.sh <seed.json> <relink.json>
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TK="$HERE/takes"
A=~/Library/Android/sdk/platform-tools/adb
T="$HERE/tools/ui.py"
SEED=$1; RELINK=$2
ev() { echo "$(date +%s) $*" | tee -a "$TK/events-c.log"; }
shot() { $A exec-out screencap -p > "$TK/still-$1.png"; ev "still $1"; }
link() { node -e '
  const seed=require(process.argv[1]), rows=require(process.argv[2]), k=process.argv[3];
  const u=seed.users[k], row=rows.find(r=>r.user_id===u.id);
  fetch(`http://localhost:5055/api/group-runs/${seed.groupRunId}/complete`,{method:"POST",
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${u.token}`},body:JSON.stringify({runId:row.run_id})})
  .then(r=>console.log(k,r.status));' "$SEED" "$RELINK" "$1"; ev "linked $1"; }
$A emu screenrecord start --time-limit 300 "$TK/takeC.webm" >/dev/null; ev "rec start"
sleep 5; shot results-2of5
link sam;    sleep 22
link jordan; sleep 22
link mia;    sleep 24
shot results-all
$T tap "Get AI Group Debrief"; ev "tap debrief"
$T wait "Finished #" 120 && ev "debrief shown"
sleep 6; shot debrief
sleep 3
$A emu screenrecord stop >/dev/null; ev "rec stop"
