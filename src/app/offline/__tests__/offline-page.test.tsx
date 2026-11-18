// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"
import { renderToStaticMarkup } from "react-dom/server"
import OfflinePage from "../page"

describe("PWA offline page & service worker (H9)", () => {
  it("renders /offline as a zero-JS Server Component with inline styles and GET form reload button", () => {
    const pageSrc = readFileSync(join(process.cwd(), "src/app/offline/page.tsx"), "utf8")
    expect(pageSrc).not.toMatch(/["']use client["']/)

    const html = renderToStaticMarkup(<OfflinePage />)
    const container = document.createElement("div")
    container.innerHTML = html

    const main = container.querySelector("main")
    expect(main?.getAttribute("style")).toContain("background-color")

    const styleTag = container.querySelector("style")?.textContent ?? ""
    expect(styleTag).toContain("min-height: 44px")
    expect(styleTag).toContain("html.dark .offline-card")

    const form = container.querySelector("form")
    expect(form?.getAttribute("method")?.toUpperCase()).toBe("GET")

    const submitBtn = form?.querySelector("button[type='submit']")
    expect(submitBtn).not.toBeNull()
    expect(submitBtn?.textContent).toContain("Muat Ulang")

    // Zero Next static chunk dependencies or client click handlers
    expect(html).not.toContain("/_next/static/")
    expect(html).not.toContain("onclick=")
  })

  it("service worker uses versioned cache cleanup, skips /api/ & auth HTML caching, and falls back to /offline", async () => {
    const swSrc = readFileSync(join(process.cwd(), "public/sw.js"), "utf8")
    const listeners = new Map<string, (event: unknown) => void>()

    const store = new Map<string, Map<string, Response>>()
    const getBucket = (name: string) => {
      if (!store.has(name)) store.set(name, new Map())
      return store.get(name)!
    }
    const cachesMock = {
      open: async (name: string) => {
        const bucket = getBucket(name)
        return {
          addAll: async (reqs: Request[]) => {
            for (const req of reqs) {
              const pathname = new URL(req.url).pathname
              bucket.set(pathname, new Response(`cached:${pathname}`, { status: 200 }))
            }
          },
        }
      },
      keys: async () => Array.from(store.keys()),
      delete: async (name: string) => store.delete(name),
      match: async (req: Request | string) => {
        const key = typeof req === "string" ? req : new URL(req.url).pathname
        for (const bucket of store.values()) {
          if (bucket.has(key)) return bucket.get(key)
        }
        return undefined
      },
    }

    const fetchMock = async (req: Request) => {
      if (new URL(req.url).pathname === "/penjualan") {
        throw new Error("Offline")
      }
      return new Response("network", { status: 200 })
    }

    // Seed old cache v1 to verify activate cleanup removes stale versions
    getBucket("yaraerp-offline-v1").set("/stale", new Response("stale"))

    runInNewContext(swSrc, {
      self: {
        location: { origin: "https://erp.local" },
        addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn),
        skipWaiting: async () => undefined,
        clients: { claim: async () => undefined },
      },
      caches: cachesMock,
      Request: class MockRequest {
        url: string
        cache?: string
        method = "GET"
        mode = "cors"
        constructor(url: string, init?: { cache?: string; method?: string; mode?: string }) {
          this.url = url.startsWith("http") ? url : `https://erp.local${url}`
          this.cache = init?.cache
          if (init?.method) this.method = init.method
          if (init?.mode) this.mode = init.mode
        }
      },
      URL,
      fetch: fetchMock,
      Response,
    })

    // 1. install caches /offline and icons into versioned bucket
    let installPromise: Promise<unknown> = Promise.resolve()
    listeners.get("install")?.({ waitUntil: (p: Promise<unknown>) => { installPromise = p } })
    await installPromise
    expect(store.has("yaraerp-offline-v2")).toBe(true)

    // 2. activate removes old v1 cache while keeping v2
    let activatePromise: Promise<unknown> = Promise.resolve()
    listeners.get("activate")?.({ waitUntil: (p: Promise<unknown>) => { activatePromise = p } })
    await activatePromise
    expect(store.has("yaraerp-offline-v1")).toBe(false)
    expect(store.has("yaraerp-offline-v2")).toBe(true)

    // 3. /api/ requests are never intercepted
    let apiRespondCalled = false
    listeners.get("fetch")?.({
      request: { method: "GET", url: "https://erp.local/api/invoices", mode: "cors" },
      respondWith: () => { apiRespondCalled = true },
    })
    expect(apiRespondCalled).toBe(false)

    // 4. navigate fallback returns cached /offline when offline and does NOT cache /penjualan HTML
    let navResponsePromise: Promise<Response> | undefined
    listeners.get("fetch")?.({
      request: { method: "GET", url: "https://erp.local/penjualan", mode: "navigate" },
      respondWith: (p: Promise<Response>) => { navResponsePromise = p },
    })
    const navRes = await navResponsePromise!
    expect(await navRes.text()).toBe("cached:/offline")
    expect(getBucket("yaraerp-offline-v2").has("/penjualan")).toBe(false)

    // 5. cached PWA icon serves from cache without hitting network
    let iconPromise: Promise<Response> | undefined
    listeners.get("fetch")?.({
      request: { method: "GET", url: "https://erp.local/icon-192.png", mode: "no-cors" },
      respondWith: (p: Promise<Response>) => { iconPromise = p },
    })
    expect(await (await iconPromise!).text()).toBe("cached:/icon-192.png")
  })
})
