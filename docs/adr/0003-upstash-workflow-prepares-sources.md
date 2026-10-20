# Upstash Workflow prepares a Source

Moving a Source from Preparing to Ready or Failed runs as an Upstash Workflow: extract text, split passages, embed. The upload returns as soon as the file is stored. Conversion through LibreOffice and embedding are slow and have to retry on their own, so they stay off the upload request.
