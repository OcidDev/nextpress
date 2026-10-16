import { PostList } from '@/components/blog/PostList'
import { MobileNavigation } from '@/components/layout/MobileNavigation'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { MainContainer } from '@/components/layout/MainContainer'
import { Sidebar } from '@/components/layout/Sidebar'
import { Widgets } from '@/components/theme/Widgets'
import { HomeSections } from '@/components/theme/HomeContent'
import { SearchButton } from '@/components/header/SearchButton'
import { MenuButton } from '@/components/header/MenuButton'
import { getViewStats } from '@/lib/db/queries/views'
import { defineBlock } from '../render'
import { blockPropsSchemas } from '../schemas'

export const siteHeaderBlock = defineBlock({
  name: 'core/site-header',
  props: blockPropsSchemas['core/site-header'],
  render: (props, { context }) =>
    props.layout === 'compact' ? (
      <header className="cmsSimpleHeader">
        <Link className="cmsSiteName" href="/">
          {context.site.name}
        </Link>
        <nav aria-label="Menu utama" className="cmsInlineNavigation">
          {context.site.navigation
            .flatMap(
              (item) =>
                item.children ?? (item.href ? [{ label: item.label, href: item.href }] : []),
            )
            .map((item, index) =>
              'href' in item && item.href ? (
                <Link key={index} href={item.href}>
                  {item.label}
                </Link>
              ) : null,
            )}
        </nav>
        <div className="cmsHeaderControls">
          <SearchButton />
          <MenuButton />
        </div>
      </header>
    ) : (
      <Header appearance={context.appearance} />
    ),
})
export const siteFooterBlock = defineBlock({
  name: 'core/site-footer',
  props: blockPropsSchemas['core/site-footer'],
  async render(props, { context }) {
    if (props.layout === 'compact')
      return (
        <footer className="cmsSimpleFooter">
          <Link className="cmsSiteName" href="/">
            {context.site.name}
          </Link>
          <p>{context.site.description}</p>
          <nav aria-label="Menu footer">
            {context.site.footer
              .filter((column) => column.enabled)
              .flatMap((column) => column.links)
              .map((link, i) => (
                <Link href={link.href} key={i}>
                  {link.label}
                </Link>
              ))}
          </nav>
          <small>
            © {new Date().getFullYear()} {context.site.name}
          </small>
        </footer>
      )
    const views = context.appearance?.footer.showStats ? (await getViewStats()).siteTotal : null
    return <Footer appearance={context.appearance} preview={context.preview} siteViews={views} />
  },
})
export const routeContentBlock = defineBlock({
  name: 'core/route-content',
  props: blockPropsSchemas['core/route-content'],
  render: (_props, { context }) => context.routeContent ?? null,
})
export const homeSectionsBlock = defineBlock({
  name: 'core/home-sections',
  props: blockPropsSchemas['core/home-sections'],
  render: (_props, { context }) =>
    context.archive?.postsPage ? (
      <section>
        <h1>{context.page?.title || 'Artikel'}</h1>
        <PostList
          result={context.archive.result}
          basePath={context.archive.basePath}
          appearance={context.appearance}
          preview={context.preview}
        />
      </section>
    ) : context.appearance ? (
      <HomeSections
        appearance={context.appearance}
        page={context.archive?.result.page}
        preview={context.preview}
      />
    ) : null,
})
export const contentLayoutBlock = defineBlock({
  name: 'core/content-layout',
  props: blockPropsSchemas['core/content-layout'],
  container: true,
  render: (props, { context, children }) =>
    props.layout === 'plain' ? (
      <main id="main-content" tabIndex={-1} className="cmsPlainContent">
        {children}
      </main>
    ) : (
      <MainContainer
        site={context.site}
        announcement={context.appearance?.announcement}
        sidebar={
          props.sidebar && context.appearance?.sidebar.some((w) => w.enabled) ? (
            <Sidebar>
              <Widgets
                items={context.appearance.sidebar}
                site={context.site}
                preview={context.preview}
              />
            </Sidebar>
          ) : undefined
        }
      >
        {children}
      </MainContainer>
    ),
})
export const siteDescriptionBlock = defineBlock({
  name: 'core/site-description',
  props: blockPropsSchemas['core/site-description'],
  render: (_props, { context }) => <p className="cmsSiteDescription">{context.site.description}</p>,
})

export const mobileNavigationBlock = defineBlock({
  name: 'core/mobile-navigation',
  props: blockPropsSchemas['core/mobile-navigation'],
  render: (_props, { context }) => (
    <MobileNavigation
      search={context.appearance?.header.search}
      theme={context.appearance?.header.themeToggle}
    />
  ),
})
