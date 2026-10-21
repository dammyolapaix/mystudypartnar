# My Study Partner

Students upload files so the AI can use what is in them, including when it writes a Set.

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

**Set**:
The Questions, Options, and Explanations the AI wrote from one Ready Source. It exists once those Questions do. It belongs to the Student who owns that Source, it is deleted with that Source, and its Attempts are deleted with it.
_Avoid_: Quiz, bank, practice, write

**Question**:
A multiple-choice prompt in a Set, with four Options and an Explanation for each, fixed before any Attempt. One or more of its Options are correct, and it asks for one of them or for all that apply.
_Avoid_: Item, QA

**Option**:
One answer a Student can select on a Question. It is either correct or wrong.
_Avoid_: Choice, distractor

**Explanation**:
Why an Option is correct or wrong, written from a page of the Source when its Question is written.
_Avoid_: Feedback, hint

**Attempt**:
One sitting of a Set, as a Practice or a Test. It is kept so the Student can resume it. A Set has at most one Attempt without a Score, and an Attempt is deleted with its Set.
_Avoid_: Session, try, run

**Right**:
A Question whose Selection in an Attempt contains every correct Option and no wrong Option.
_Avoid_: Correct, passed, partial

**Practice**:
An Attempt that shows whether a Selection is right or wrong, and the Explanations, as soon as that Question is submitted. It receives its Score when the last Question is submitted.
_Avoid_: Drill, review

**Test**:
An Attempt that shows the Score and the Explanations only after the Student finishes it. The Student can finish it once every Question has a Selection.
_Avoid_: Exam, assessment

**Selection**:
The Options a Student has chosen for one Question in an Attempt.
_Avoid_: Answer, response

**Score**:
How many Questions were Right in a finished Attempt, out of how many Questions its Set contains.
_Avoid_: Grade, percentage, mark
