import type { Client } from '@notionhq/client'
import type { Note, VendorEntity } from '../types.js'
import type { QueryDatabaseResponse, PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js'
import { createNotionPageVendorEntity } from './vendor-entity.js'
import { logger } from '../common/logger.js'

const SERIALIZED_VENDOR_ENTITY_REGEX = /^(.+?):(\{.+\}):(.+)$/

export function noteToNotionPageProperties(note: Note): Parameters<Client['pages']['create']>[0]['properties'] {
  const properties: Parameters<Client['pages']['create']>[0]['properties'] = {
    'Name': {
      type: 'title',
      title: [
        {
          type: 'text',
          text: {
            content: note.content,
          },
        },
      ],
    },
    'Tags': {
      type: 'multi_select',
      multi_select: note.tags.map((tag) => ({ name: tag })),
    },
    'Status': {
      type: 'select',
      select: {
        name: note.status === 'done'
          ? 'Done'
          : note.status === 'in_progress'
            ? 'In progress'
            : 'Not started',
      },
    }
  }

  for (const vendorEntity of note.vendorEntities) {
    if (vendorEntity.type === 'notion_page') continue

    properties[`entity:${vendorEntity.type}`] = {
      type: 'rich_text',
      rich_text: [
        {
          type: 'text',
          text: {
            content: `${vendorEntity.id}:${JSON.stringify(vendorEntity.metadata)}:${vendorEntity.hash}`
          }
        }
      ]
    }
  }

  logger.debug({ properties }, 'Serialized Notion page properties from a note')

  return properties
}

export function notionPagesToNotes(databaseId: string, pages: QueryDatabaseResponse['results']): Note[] {
  const notes: Note[] = []

  for (const page of pages) {
    if (!('properties' in page)) continue

    const nameProperty = page.properties['Name']
    const tagsProperty = page.properties['Tags']
    const statusProperty = page.properties['Status']
    const entityProperties: [string, PageObjectResponse['properties'][number]][] = Object
      .entries(page.properties)
      .filter(([name]) => name.startsWith('entity:'))

    if (!('title' in nameProperty)) continue
    if (!('multi_select' in tagsProperty) || !Array.isArray(tagsProperty.multi_select)) continue
    if (!('select' in statusProperty) || (statusProperty.select && 'options' in statusProperty.select)) continue

    const content = nameProperty.title.at(0)?.plain_text ?? ''

    const tags = tagsProperty.multi_select.map((tag) => tag.name)
    const status = statusProperty.select?.name === 'In progress'
      ? 'in_progress'
      : statusProperty.select?.name === 'Done'
        ? 'done'
        : statusProperty.select?.name === 'To delete'
          ? 'to_delete'
          : 'not_started'

    const vendorEntities: VendorEntity[] = [createNotionPageVendorEntity(databaseId, page)]
    for (const [name, property] of entityProperties) {
      if (!('rich_text' in property)) continue

      const type = name.slice('entity:'.length)
      if (type !== 'telegram_message') continue

      const serialized = property.rich_text[0]?.plain_text
      if (!serialized) continue

      const match = serialized.match(SERIALIZED_VENDOR_ENTITY_REGEX)
      if (!match) continue

      const [, id, metadata, hash] = match

      vendorEntities.push({
        type,
        id,
        hash,
        metadata: JSON.parse(metadata),
      })
    }

    notes.push({
      content,
      tags,
      vendorEntities,
      status,
    })
  }

  return notes
}
