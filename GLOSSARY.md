# My Study Partner

Students upload files so the AI can later use what is in them.

## Language

**Student**:
A person with an account. Each Source belongs to one Student and is deleted with that Student.
_Avoid_: Teacher, account

**Source**:
A file a Student has uploaded. It belongs to that Student alone.
_Avoid_: Document, upload, knowledge base

**Preparing**:
A Source that has been stored and is not Ready or Failed yet.
_Avoid_: Pending, processing, queued

**Passage**:
A contiguous piece of text taken from one page of a Source, small enough for the AI to retrieve on its own. It remembers which Source and which page it came from.
_Avoid_: Chunk, fragment

**Ready**:
A Source the AI can use, because its passages are prepared for retrieval. Once Ready, it stays as uploaded.
_Avoid_: Processed, indexed, trained

**Failed**:
A Source the AI cannot use, because its passages could not be prepared.
_Avoid_: Rejected, invalid, error

**Failure reason**:
Why a Failed Source could not be prepared: the file could not be opened, no text was found, or embedding failed.
