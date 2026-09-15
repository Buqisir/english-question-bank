import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { all, passage } from '../design/icon-system-2026-09-15/icons-v3.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'app/src/icons/generated')
const header = '// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.\n'
const iconSet = { ...all, ...passage }

function pascalCase(key) {
  return key.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('')
}

function componentName(key) {
  if (key === 'grid-2x2') return 'Grid2X2'
  return Object.hasOwn(passage, key) ? `Type${pascalCase(key)}` : pascalCase(key)
}

function jsxElements(markup, { omitDots = false } = {}) {
  return markup.replace(/<(path|circle|rect)([^>]*)\/>/g, (_match, tag, rawAttributes) => {
    const attributes = [...rawAttributes.matchAll(/([\w-]+)="([^"]*)"/g)]
    const className = attributes.find(([_, name]) => name === 'class')?.[2]
    if (omitDots && className === 'dot') return ''
    const rendered = attributes
      .filter(([_, name]) => name !== 'class')
      .map(([_, name, value]) => `${name === 'fill-opacity' ? 'fillOpacity' : name}="${value}"`)
    if (className === 'dot' || className === 'joint') rendered.push('fill="currentColor"', 'stroke="none"')
    return `<${tag}${rendered.length ? ` ${rendered.join(' ')}` : ''} />`
  })
}

function componentSource(key, icon) {
  const name = componentName(key)
  const line = jsxElements(icon.line)
  const fillLine = jsxElements(icon.line, { omitDots: true })
  const fillShape = icon.fillShape ? jsxElements(icon.fillShape) : ''
  return `${header}import { EqbIcon, type EqbIconProps } from '../EqbIcon'\n\nexport function ${name}({ variant = 'line', ...props }: EqbIconProps) {\n  return (\n    <EqbIcon {...props}>\n      {variant === 'fill' && ${fillShape ? `<g fill="currentColor" fillOpacity={0.16} stroke="none">${fillShape}</g>` : 'null'}}\n      {variant === 'fill' ? <>${fillLine}</> : <>${line}</>}\n    </EqbIcon>\n  )\n}\n`
}

await mkdir(outputDir, { recursive: true })
for (const [key, icon] of Object.entries(iconSet)) {
  await writeFile(join(outputDir, `${key}.tsx`), componentSource(key, icon))
}
console.log(`Generated ${Object.keys(iconSet).length} EQB icons in app/src/icons/generated`)
