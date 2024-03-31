import type { Event, EventEmitter, EventHandler } from './types.js'

export class InMemoryQueue implements EventEmitter {
  private readonly eventHandlers: EventHandler[] = []

  registerEventHandler(eventHandler: EventHandler): void {
    this.eventHandlers.push(eventHandler)
  }

  async emit(event: Event): Promise<void> {
    for (const eventHandler of this.eventHandlers) {
      await eventHandler.handle(event)
    }
  }
}