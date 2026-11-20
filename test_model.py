import cv2
from ultralytics import YOLO

# 1. Load your model
model = YOLO('best.pt')

# 2. Path to your photo
image_path = 'Shrimp with Feeds - 85.jpg'

# 3. Increase conf to 0.50 (50%) to remove weak/false overlaps
results = model(image_path, conf=0.35)

# 4. Print detections to the terminal
print("\n--- DETECTION SUMMARY (Conf >= 35%) ---")
boxes = results[0].boxes

if len(boxes) == 0:
    print("Result: No objects detected.")
else:
    for idx, box in enumerate(boxes):
        class_id = int(box.cls.item())
        class_name = model.names[class_id]
        confidence_pct = box.conf.item() * 100
        print(f"Object #{idx + 1}: Class '{class_name}' | Confidence: {confidence_pct:.2f}%")

# 5. Plot results with thinner lines and smaller text
annotated_img = results[0].plot(line_width=2, font_size=0.8)

# 6. Save the full annotated image to your folder
output_filename = 'result_annotated.jpg'
cv2.imwrite(output_filename, annotated_img)
print(f"\nSaved full image to '{output_filename}'")

# 7. Create a resizable window that fits standard screen sizes
window_name = "Smart AquaGuard - Model Test (Full View)"
cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
cv2.resizeWindow(window_name, 960, 720)

cv2.imshow(window_name, annotated_img)
cv2.waitKey(0)
cv2.destroyAllWindows()