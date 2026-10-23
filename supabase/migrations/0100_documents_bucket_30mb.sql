-- เอกสาร (PDF ฯลฯ): ขยายขีดจำกัดไฟล์จาก 20 MB เป็น 30 MB. Mirrors DOC_MAX_BYTES in src/hooks/useDocuments.ts.
update storage.buckets set file_size_limit = 31457280 where id = 'subject-documents';
