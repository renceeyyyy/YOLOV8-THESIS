import os
import cv2
from datetime import datetime
from ultralytics import YOLO

# 1. Configuration & file verification
MODEL_PATH = 'best.pt'
IMAGE_PATH = 'Shrimp with Feeds - 85.jpg' if os.path.exists('Shrimp with Feeds - 85.jpg') else 'Shrimp with Feeds - 85.jpg'
CONF_THRESHOLD = 0.50
OUTPUT_IMAGE = 'result_annotated.jpg'
REPORT_FILE = 'progress_report.txt'

if not os.path.exists(IMAGE_PATH):
    print(f"Error: Could not find '{IMAGE_PATH}' in {os.getcwd()}")
    exit()

# 2. Load model & run inference
print(f"Processing '{IMAGE_PATH}' using {MODEL_PATH} (conf={CONF_THRESHOLD})...")
model = YOLO(MODEL_PATH)
results = model(IMAGE_PATH, conf=CONF_THRESHOLD)
result = results[0]

# 3. Parse detections
detections = []
boxes = result.boxes
class_counts = {}

if boxes is not None and len(boxes) > 0:
    for box in boxes:
        cls_id = int(box.cls.item())
        cls_name = model.names[cls_id]
        conf = float(box.conf.item()) * 100
        
        detections.append({'class': cls_name, 'confidence': conf})
        class_counts[cls_name] = class_counts.get(cls_name, 0) + 1

detections.sort(key=lambda x: x['confidence'], reverse=True)

# 4. Compute metrics
total_objects = len(detections)
confidences = [d['confidence'] for d in detections]
avg_conf = sum(confidences) / total_objects if total_objects > 0 else 0.0
max_conf = max(confidences) if total_objects > 0 else 0.0
min_conf = min(confidences) if total_objects > 0 else 0.0

# 5. Save the visual annotated output
annotated_img = result.plot(line_width=2, font_size=0.8)
cv2.imwrite(OUTPUT_IMAGE, annotated_img)

# 6. Format and write the report
report_content = f"""=======================================================
SMART AQUAGUARD: COMPUTER VISION SUBSYSTEM PROGRESS REPORT
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
=======================================================

1. TEST RUN PARAMETERS
-------------------------------------------------------
Model Weights File    : {MODEL_PATH}
Input Image           : {IMAGE_PATH}
Confidence Threshold  : {CONF_THRESHOLD * 100:.1f}%

2. DETECTION PERFORMANCE SUMMARY
-------------------------------------------------------
Total Objects Found   : {total_objects}
Highest Confidence    : {max_conf:.2f}%
Lowest Confidence     : {min_conf:.2f}%
Average Confidence    : {avg_conf:.2f}%

Class Breakdown:
"""
for cls_name, count in class_counts.items():
    report_content += f"  - Class '{cls_name}': {count} detected\n"

report_content += """
-------------------------------------------------------
3. DETAILED OBJECT DETECTIONS (SORTED BY CONFIDENCE)
-------------------------------------------------------
"""
for idx, d in enumerate(detections, start=1):
    report_content += f"Object #{idx:02d}: Class '{d['class']}' | Confidence: {d['confidence']:.2f}%\n"

report_content += f"""
=======================================================
Annotated Image Exported to: {OUTPUT_IMAGE}
Report Exported to         : {REPORT_FILE}
=======================================================
"""

with open(REPORT_FILE, 'w') as f:
    f.write(report_content)

print(report_content)

# 7. Open visual display window on screen
window_name = "Smart AquaGuard - Inspection Window"
cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
cv2.resizeWindow(window_name, 960, 720)
cv2.imshow(window_name, annotated_img)

print("Press any key on the image window to close it...")
cv2.waitKey(0)
cv2.destroyAllWindows()