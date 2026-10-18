ALTER TABLE "Image"
 ADD COLUMN "orderName" TEXT,
 ADD COLUMN "detectedReference" TEXT,
 ADD COLUMN "ocrConfidence" DOUBLE PRECISION,
 ADD COLUMN "captureDate" TEXT,
 ADD COLUMN "capturedAtLocal" TEXT,
 ADD COLUMN "captureOffset" TEXT,
 ADD COLUMN "captureSource" TEXT NOT NULL DEFAULT 'UNKNOWN',
 ADD COLUMN "filedDate" TEXT;
-- Preserve legacy filing dates without misrepresenting upload time as original capture time.
UPDATE "Image" AS i SET "filedDate" = f."date", "captureSource" = 'UPLOAD_LEGACY'
 FROM "DriveFolder" AS f WHERE i."folderId" = f."id";
CREATE INDEX "Image_filedDate_idx" ON "Image"("filedDate");
