/* prettier-ignore-start */

/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file is auto-generated by TanStack Router

// Import Routes

import { Route as rootRoute } from './routes/__root'
import { Route as IndexImport } from './routes/index'
import { Route as NotesIndexImport } from './routes/notes/index'
import { Route as IntegrationsIndexImport } from './routes/integrations/index'
import { Route as BucketsIndexImport } from './routes/buckets/index'

// Create/Update Routes

const IndexRoute = IndexImport.update({
  path: '/',
  getParentRoute: () => rootRoute,
} as any)

const NotesIndexRoute = NotesIndexImport.update({
  path: '/notes/',
  getParentRoute: () => rootRoute,
} as any)

const IntegrationsIndexRoute = IntegrationsIndexImport.update({
  path: '/integrations/',
  getParentRoute: () => rootRoute,
} as any)

const BucketsIndexRoute = BucketsIndexImport.update({
  path: '/buckets/',
  getParentRoute: () => rootRoute,
} as any)

// Populate the FileRoutesByPath interface

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      preLoaderRoute: typeof IndexImport
      parentRoute: typeof rootRoute
    }
    '/buckets/': {
      preLoaderRoute: typeof BucketsIndexImport
      parentRoute: typeof rootRoute
    }
    '/integrations/': {
      preLoaderRoute: typeof IntegrationsIndexImport
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
  BucketsIndexRoute,
  IntegrationsIndexRoute,
  NotesIndexRoute,
])

/* prettier-ignore-end */
