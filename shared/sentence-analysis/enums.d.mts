import type { Unit } from './types.d.mts'

export const ROLES: readonly string[]
export const ROLE_LABELS: Record<string, string>
export const FORMS: readonly string[]
export const FORM_LABELS: Record<string, string>
export const NONFINITE_FORMS: readonly string[]
export const LAYER_FORMS: readonly string[]
export const SENSES: readonly string[]
export const SENSE_LABELS: Record<string, string>
export const OBSTACLES: readonly string[]
export const OBSTACLE_LABELS: Record<string, string>
export const LEXICAL_OBSTACLES: readonly string[]
export function isLexicalObstacle(obstacle: string): boolean
export const VOICES: readonly string[]
export const MARKS: readonly string[]
export const MARK_LABELS: Record<string, string>
export const CONNECTORS: readonly string[]
export const CONNECTOR_LABELS: Record<string, string>
export const RELATION_KINDS: readonly string[]
export const RESTORE_KINDS: readonly string[]
export const RESTORE_KIND_LABELS: Record<string, string>
export const RESTORE_BUTTON_LABELS: Record<string, string>
export const PRIMARY_ROLES: readonly string[]
export function isNonfiniteForm(form: string): boolean
export function isLayerForm(form: string): boolean
export function roleLabel(role: string | null | undefined): string
export function formLabel(form: string | null | undefined): string
export function senseLabel(sense: string | null | undefined): string
export function obstacleLabel(obstacle: string): string
export function markLabel(mark: string): string
export function connectorLabel(kind: string): string
export function clauseChipLabel(unit: Unit): string
export function clauseTitleLabel(unit: Unit): string
export function adverbialRoleLabel(unit: Unit): string
export function nonfiniteLabel(unit: Unit): string
export function unitFormPart(unit: Unit): string
export function unitChipLabel(unit: Unit): string
export function unitTitleLabel(unit: Unit): string
