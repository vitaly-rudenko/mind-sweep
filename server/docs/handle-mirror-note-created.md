# Handle Note created in a Mirror Bucket

## Diagram

```mermaid
sequenceDiagram

box Vendor
participant mirror as Mirror Bucket
end

box App
participant app as App
participant db as Database
end

box Vendor
participant source as Source bucket
end

mirror ->>+ app: Note created
app ->> db: Get Links for the Mirror Bucket
db ->> app: [Links]

loop Every Link
  opt Link.SourceBucket was not processed? & isMatching(Note, Link)?
    app ->>+ source: Create Note
    source ->>- app: OK

    opt Link.stopOnMatch?
      app -x app: Stop loop
    end

    app ->> app: Mark Link.SourceBucket as processed
  end
end

app ->>- mirror: OK
```

## Examples

```mermaid
graph LR

Mirror1["Telegram chat"] -->|"1. 'Buy {Item}' (stopOnMatch: true)"| Source1["'Personal' Notion database"]
Mirror1 -->|"2. 'Read {Book}' (stopOnMatch: false)"| Source1
Mirror1 -->|"3. '{Note}' (stopOnMatch: false)"| Source1
Mirror1 -->|"4. 'Work on {Task}' (stopOnMatch: true)"| Source2["'Work' Notion database"]
Mirror1 -->|"5. '{Note}' (stopOnMatch: false)"| Source3["4. 'Slipbox' Notion database"]
```

- `Buy something`
  1. ✅ `Buy {Item}` -> **Personal** (_stopOnMatch: true_)
  2. ~~`Read {Book}` -> **Personal** (_stopOnMatch: false_)~~
  3. ~~`{Note}` -> **Personal** (_stopOnMatch: false_)~~
  4. ~~`Work on {Task}` -> **Work** (_stopOnMatch: true_)~~
  5. ~~`{Note}` -> **Slipbox** (_stopOnMatch: false_)~~
> Matches Links 1, 3 and 5, but since Link 1 has `stopOnMatch` enabled, only Link 1 is processed.

- `Read a book`
  1. ❌ `Buy {Item}` -> **Personal** (_stopOnMatch: true_)
  2. ✅ `Read {Book}` -> **Personal** (_stopOnMatch: false_)
  3. ⏩ `{Note}` -> **Personal** (_stopOnMatch: false_)
  4. ❌ `Work on {Task}` -> **Work** (_stopOnMatch: true_)
  5. ✅ `{Note}` -> **Slipbox** (_stopOnMatch: false_)
> Matches Links 2, 3 and 5, but since Links 2 and 3 belong to the same bucket, only Links 2 and 5 are processed. Link 3 is skipped.

> **RULE: Only one match is allowed per one Source Bucket**

- `Work on a task`
  1. ❌ `Buy {Item}` -> **Personal** (_stopOnMatch: true_)
  2. ❌ `Read {Book}` -> **Personal** (_stopOnMatch: false_)
  3. ✅ `{Note}` -> **Personal** (_stopOnMatch: false_)
  4. ✅ `Work on {Task}` -> **Work** (_stopOnMatch: true_)
  5. ~~`{Note}` -> **Slipbox** (_stopOnMatch: false_)~~
> Matches Links 3, 4 and 5, but since Link 4 has `stopOnMatch` enabled, only Link 3 and 4 are processed.

- `Watch a movie`
  1. ❌ `Buy {Item}` -> **Personal** (_stopOnMatch: true_)
  2. ❌ `Read {Book}` -> **Personal** (_stopOnMatch: false_)
  3. ✅ `{Note}` -> **Personal** (_stopOnMatch: false_)
  4. ❌ `Work on {Task}` -> **Work** (_stopOnMatch: true_)
  5. ✅ `{Note}` -> **Slipbox** (_stopOnMatch: false_)
> Matches Links 3 and 5.
