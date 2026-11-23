#!/bin/bash
# =============================================================================
# Malattie dell'orto - training del classificatore v1 (YOLO11n-cls, 224 px)
#
# Aspetta che il PC sia libero (nessun training o esame di PorcinoFinder in
# corso: mai due training insieme), poi addestra su ~/OrtoMalattie/dataset_v1
# e misura la precisione sulla parte "test" (mai vista nel training).
#
#   setsid nohup tools/malattie/addestra_v1.sh > ~/OrtoMalattie/addestra_v1.log 2>&1 &
# =============================================================================

PY="/mnt/ssd1t/Documenti/brio.col@gmail.com/MySyncFolder/PorcinoFinder/.venv/bin/python"
YOLO="$(dirname "$PY")/yolo"
cd ~/OrtoMalattie || exit 1

echo "In attesa che il PC sia libero: $(date)"
while pgrep -f "yolo detect train|esame_v1[0-9]*.sh|tools/eval/predici" > /dev/null; do
  sleep 60
done
echo "PC libero, parto: $(date)"

"$YOLO" classify train model=modelli/yolo11n-cls.pt data="$HOME/OrtoMalattie/dataset_v1" \
  imgsz=224 epochs=30 batch=32 device=cpu workers=4 seed=2026 \
  project="$HOME/OrtoMalattie/runs" name=malattie_v1 exist_ok=True || exit 1

echo "Training finito: $(date)"
# Ultralytics a volte annida la cartella del progetto: cerco il best.pt.
BEST=$(find "$HOME/OrtoMalattie/runs" -path "*malattie_v1/weights/best.pt" | head -1)
echo "Pesi: $BEST"
"$YOLO" classify val model="$BEST" \
  data="$HOME/OrtoMalattie/dataset_v1" split=test imgsz=224 batch=32 device=cpu \
  project="$HOME/OrtoMalattie/runs" name=malattie_v1_test exist_ok=True
echo "FINITO: $(date)"
