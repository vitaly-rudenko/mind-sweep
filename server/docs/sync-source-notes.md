# Sync Notes from linked Source Buckets to a Mirror Bucket

## Diagram

```mermaid
sequenceDiagram

actor user as User

box App
participant app as App
participant db as Database
end

box Vendor
participant mirror as Mirror Bucket
participant source as Source bucket
end

user ->>+ app: Sync Notes for this Mirror Bucket
app ->> db: Get Links for the Mirror Bucket

loop Every Link.SourceBucket
  app ->> source: Read Notes
  source ->> app: [Notes]
  
  loop Every Note
    app ->> app: Find MatchingLink for the Note
    
    alt MatchingLink found & MatchingLink.SourceBucket = Link.SourceBucket
      opt Note.MirrorVendorEntity belongs to another Mirror Bucket
        app ->>+ mirror: Delete Note by Note.MirrorVendorEntity
        mirror ->>- app: OK
      end

      app ->>+ mirror: Update/Create Note by Note.MirrorVendorEntity
      mirror ->>- app: [Note with updated MirrorVendorEntity]

      app ->>+ source: Update/Create Note by Note.SourceVendorEntity
      source ->>- app: OK
    else 
      app ->>+ source: Detach Note by Note.MirrorVendorEntity
      source ->>- app: OK
    end
  end
end

app ->>- user: OK
```
