/* prettier-ignore-start */

/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file is auto-generated by TanStack Router

// Import Routes

import { Route as rootRoute } from './routes/__root'
import { Route as IndexImport } from './routes/index'
import { Route as NotesIndexImport } from './routes/notes/index'
import { Route as LinksIndexImport } from './routes/links/index'
import { Route as IntegrationsIndexImport } from './routes/integrations/index'

// Create/Update Routes

const IndexRoute = IndexImport.update({
  path: '/',
  getParentRoute: () => rootRoute,
} as any)

const NotesIndexRoute = NotesIndexImport.update({
  path: '/notes/',
  getParentRoute: () => rootRoute,
} as any)

const LinksIndexRoute = LinksIndexImport.update({
  path: '/links/',
  getParentRoute: () => rootRoute,
} as any)

const IntegrationsIndexRoute = IntegrationsIndexImport.update({
  path: '/integrations/',
  getParentRoute: () => rootRoute,
} as any)

// Populate the FileRoutesByPath interface

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      preLoaderRoute: typeof IndexImport
      parentRoute: typeof rootRoute
    }
    '/integrations/': {
      preLoaderRoute: typeof IntegrationsIndexImport
      parentRoute: typeof rootRoute
    }
    '/links/': {
      preLoaderRoute: typeof LinksIndexImport
      parentRoute: typeof rootRoute
    }
    '/notes/': {
      preLoaderRoute: typeof NotesIndexImport
      parentRoute: typeof rootRoute
    }
  }
}

// Create and export the route tree

export const routeTree = rootRoute.addChildren([
  IndexRoute,
  IntegrationsIndexRoute,
  LinksIndexRoute,
  NotesIndexRoute,
])

/* prettier-ignore-end */
