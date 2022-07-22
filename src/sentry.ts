import { init as sentryInit, addBreadcrumb as sentryAddBreadcrumb, captureMessage, captureException } from "@sentry/node";

export function init(dsn: string | undefined, extra: { [key: string]: string }) {
  sentryInit({
    dsn,
    environment: process.env.RUN_ENV ?? "production",
    release: process.env.SENTRY_RELEASE,
    beforeBreadcrumb: (crumb, _) => {
      if (crumb.category === "console" && crumb.message?.charAt(0) === '[') return null; // Remove logs from addBreadcrumb
      if (crumb.category === "http") return null; // Remove http calls

      return crumb
    },
    beforeSend: (event, _) => {
      if (event.tags?.category !== undefined) {
        event.breadcrumbs = (event.breadcrumbs || [])
          .filter((crumb) =>
            crumb.data?.category === undefined // Allow other breadcrumbs
            || (crumb.data?.category === event.tags?.category && crumb.data?.tag === event.tags?.tag))// Remove different breadcrumbs
          .map((crumb) => {
            if (crumb.data?.category !== undefined) {
              crumb.data = undefined
            }

            return crumb
          })
      }

      event.extra = { ...event.extra, ...extra }

      return event
    }
  });
}

export function addBreadcrumb(category: string, tag: string, message: string) {
  console.log(`[${tag}] ${message}`)

  sentryAddBreadcrumb({
    category,
    message,
    data: {
      category,
      tag: tag.toLowerCase()
    }
  })
}

export function addMessage(category: string, tag: string, message: string, extra: { [key: string]: string } = {}) {
  console.log(`[${tag}] ${message}`, extra)

  captureMessage(message, { tags: { category, tag: tag.toLowerCase() }, extra })
}

export function addException(category: string, tag: string, exception: any, extra: { [key: string]: string } = {}) {
  console.error(`[${tag}] ${exception}`, extra)

  captureException(exception, { tags: { category, tag: tag.toLowerCase() }, extra })
}

export function addGenericException(exception: any) {
  addException('', '', exception)
}

