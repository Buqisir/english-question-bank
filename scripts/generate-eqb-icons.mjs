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

function jsxElements(markup) {
  return markup.replace(/<(path|circle|rect)([^>]*)\/>/g, (_match, tag, rawAttributes) => {
    const attributes = [...rawAttributes.matchAll(/([\w-]+)="([^"]*)"/g)]
    const className = attributes.find(([_, name]) => name === 'class')?.[2]
    const smallStroke = attributes.find(([_, name]) => name === 'data-stroke-small')?.[2]
    const rendered = attributes
      .filter(([_, name]) => name !== 'class' && name !== 'data-stroke-small')
      .map(([_, name, value]) => name === 'stroke-width' && smallStroke !== undefined
        ? `strokeWidth={isSmall ? ${Number(smallStroke)} : ${Number(value)}}`
        : `${name === 'fill-opacity' ? 'fillOpacity' : name === 'stroke-width' ? 'strokeWidth' : name === 'fill-rule' ? 'fillRule' : name}="${value}"`)
    if (className === 'dot' || className === 'joint') rendered.push('fill="currentColor"', 'stroke="none"')
    return `<${tag}${rendered.length ? ` ${rendered.join(' ')}` : ''} />`
  })
}

function componentSource(key, icon) {
  const name = componentName(key)
  const line = jsxElements(icon.line)
  // Fill adds a quiet background; it must not remove pupils, punctuation or noteheads.
  const fillLine = line
  const fillShape = icon.fillShape ? jsxElements(icon.fillShape) : ''
  const stroke = icon.strokeWidth === undefined ? '' : ` strokeWidth={${icon.strokeWidth}}`
  // Compound glyphs may need size-specific local strokes without changing the paper/body tier.
  const localTiers = /data-stroke-small=/.test(icon.line + (icon.fillShape ?? ''))
  const sizeProp = localTiers ? 'size = 24, ' : ''
  const sizeAttr = localTiers ? ' size={size}' : ''
  const sizeSetup = localTiers ? "  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)\n  const isSmall = Number.isFinite(numericSize) && numericSize < 24\n" : ''
  return `${header}import { EqbIcon, type EqbIconProps } from '../EqbIcon'\n\nexport function ${name}({ ${sizeProp}variant = 'line', ...props }: EqbIconProps) {\n${sizeSetup}  return (\n    <EqbIcon${stroke}${sizeAttr} {...props}>\n      {variant === 'fill' && ${fillShape ? `<g fill="currentColor" fillOpacity={0.16} stroke="none">${fillShape}</g>` : 'null'}}\n      {variant === 'fill' ? <>${fillLine}</> : <>${line}</>}\n    </EqbIcon>\n  )\n}\n`
}

await mkdir(outputDir, { recursive: true })
for (const [key, icon] of Object.entries(iconSet)) {
  await writeFile(join(outputDir, `${key}.tsx`), componentSource(key, icon))
}
console.log(`Generated ${Object.keys(iconSet).length} EQB icons in app/src/icons/generated`)
