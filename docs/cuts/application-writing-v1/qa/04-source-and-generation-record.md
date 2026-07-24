# Ticket 04 source and generation record

## Locked sources

- Question DOCX SHA-256: `960d0f8d6fddc3e6ccff22a15c9044170cb58f59a8b62f9870cf522df8cde25b`
- Answer DOCX SHA-256: `cb59414336068de60c9949ee05e36182775e16d2930ec864975dcfd514bd402a`
- Question location checked: rendered question page 9 and DOCX paragraphs 193–206.
- Official model answer location checked: rendered answer page 1 and DOCX paragraphs 14–20.

## Complete-task comparison

The Ticket 02 adapter output contained the reporter identity, last Friday's Open Day, Chris's English demonstration class, both explicit content points, the 80-word target, detail allowance, salutation, given opening, closing, and signature.

The stored asset's second `注意` item is incorrectly numbered as another `(2)`. The paper asset and adapter were not changed. Only the task-local generated prompt was corrected to the source structure:

```text
注意：
(1)写作词数应为80左右；
(2)可适当增加细节，使内容充实、行文连贯。
```

## Generation and official transcription

- The driver produced the task-local prompt from the byte-for-byte Appendix A authority.
- The generated model answer was pure English composition text and passed the application machine gate with 90 student-written words (`recommended`) after deducting every given line, including the opening sentence.
- The independent ten-point content review returned `PASS` with no findings.
- The official model answer was transcribed only from the locked answer DOCX.
- Recorded layout normalization: removed trailing paragraph spaces and renderer line wrapping; retained semantic paragraph breaks, the salutation, closing, signature, punctuation, spelling, and curly apostrophes without wording changes.
- No highlight expressions, audit, review findings, raw model response, or other working fields are candidates for persistence.
