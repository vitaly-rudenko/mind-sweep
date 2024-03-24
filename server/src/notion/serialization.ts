import type { Client } from '@notionhq/client'
import type { Note, VendorEntity } from '../types.js'
import type { QueryDatabaseResponse, PageObjectResponse, DatabaseObjectResponse, PartialDatabaseObjectResponse, PartialPageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js'
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

    const content = isValidNameProperty(nameProperty)
      ? nameProperty.title.at(0)?.plain_text ?? ''
      : ''

    const tags = isValidTagsProperty(tagsProperty)
      ? tagsProperty.multi_select.map((tag) => tag.name)
      : []

    const status = isValidStatusProperty(statusProperty)
      ? statusProperty.select?.name === 'In progress'
        ? 'in_progress'
        : statusProperty.select?.name === 'Done'
          ? 'done'
          : statusProperty.select?.name === 'To delete'
            ? 'to_delete'
            : 'not_started'
      : 'not_started'

    const vendorEntities: VendorEntity[] = [createNotionPageVendorEntity(databaseId, page)]
    for (const [name, property] of entityProperties) {
      if (!isValidVendorEntityProperty(property)) continue

      const type = name.slice('entity:'.length)
      if (type !== 'telegram_message') continue

      const serialized = property.rich_text.at(0)?.plain_text
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
type Property = (PageObjectResponse | PartialDatabaseObjectResponse | DatabaseObjectResponse)['properties'][string]

function isValidNameProperty(property?: Property): property is Extract<Property, { type: 'title' }> {
  return Boolean(property && 'title' in property)
}

function isValidTagsProperty(property?: Property): property is Extract<Property, { type: 'multi_select'; multi_select: unknown[] }> {
  return Boolean(property && 'multi_select' in property && Array.isArray(property.multi_select))
}

function isValidStatusProperty(property?: Property): property is Extract<Property, { type: 'select'; select: null | { name: string } }> {
  return Boolean(property && 'select' in property && (!property.select || !('options' in property.select)))
}

function isValidVendorEntityProperty(property?: Property): property is Extract<Property, { type: 'rich_text' }> {
  return Boolean(property && 'rich_text' in property)
}
