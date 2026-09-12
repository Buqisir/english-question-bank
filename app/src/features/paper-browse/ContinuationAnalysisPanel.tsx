import type { ReactNode } from 'react'
import type {
  ContinuationAnalysisV1,
  ContinuationDevelopmentPlan,
  ContinuationConstraint,
  ContinuationEvidenceRef,
  ContinuationGroundedStatement,
  ContinuationParagraphContract,
  ContinuationStoryUnderstanding,
  ContinuationContract,
} from '../../domain/continuationAnalysis.ts'
import type { ContinuationWritingAnalysis } from '../../domain/paperAsset.ts'
import { projectContinuationAnalysisDisplay } from '../../../../shared/writing/continuationAnalysis.mjs'

const EVIDENCE_SOURCE_LABEL: Record<ContinuationEvidenceRef['source'], string> = {
  instruction: '题干',
  material: '原文',
  paragraph1Starter: '段首句1',
  paragraph2Starter: '段首句2',
}

const CONFIDENCE_LABEL: Record<ContinuationAnalysisV1['storyUnderstanding']['meaningDirection']['confidence'], string> = {
  explicit: '原文已说明',
  stronglyInferred: '强推断',
  open: '开放',
}

function EvidenceList({ evidence }: { evidence: ContinuationEvidenceRef[] }): ReactNode {
  if (!Array.isArray(evidence) || evidence.length === 0) return null
  return (
    <ul className="continuation-analysis-evidence">
      {evidence.map((item, index) => (
        <li key={`${item.source}-${index}`}>
          <span className="continuation-analysis-evidence-source">
            {EVIDENCE_SOURCE_LABEL[item.source] ?? item.source}
          </span>
          <q className="continuation-analysis-evidence-quote">{item.excerpt}</q>
        </li>
      ))}
    </ul>
  )
}

function Grounded({
  statement,
  evidence,
}: ContinuationGroundedStatement): ReactNode {
  return (
    <div className="continuation-analysis-grounded">
      <p>{statement}</p>
      <EvidenceList evidence={evidence} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="continuation-analysis-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function ConstraintList({ items }: { items: ContinuationConstraint[] }): ReactNode {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <ul className="continuation-analysis-stack">
      {items.map((item) => (
        <li key={item.id}>
          <Grounded statement={item.statement} evidence={item.evidence} />
        </li>
      ))}
    </ul>
  )
}

function StringList({ items }: { items: string[] }): ReactNode {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <ul className="continuation-analysis-bullets">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  )
}

function ParagraphContractCard({
  contract,
}: {
  contract: ContinuationParagraphContract
}): ReactNode {
  return (
    <div className="continuation-analysis-subcard">
      <h6>第{contract.paragraphIndex}段约束</h6>
      <dl>
        <Field label="进入状态">
          <Grounded {...contract.entryState} />
        </Field>
        <Field label="段首句作用">
          <Grounded {...contract.starterFunction} />
        </Field>
        <Field label="必须完成">
          <ConstraintList items={contract.requiredMoves} />
        </Field>
        <Field label="必须达到的退出状态">
          <ConstraintList items={contract.requiredExitState} />
        </Field>
        {contract.supportedOptions.length > 0 && (
          <Field label="适宜选项">
            <ul className="continuation-analysis-stack">
              {contract.supportedOptions.map((option, index) => (
                <li key={index}><Grounded {...option} /></li>
              ))}
            </ul>
          </Field>
        )}
      </dl>
    </div>
  )
}

function DevelopmentParagraphCard({ paragraph }: { paragraph: any }): ReactNode {
  return (
    <div className="continuation-analysis-subcard">
      <h6>第{paragraph.paragraphIndex}段</h6>
      <dl>
        <Field label={paragraph.paragraphPurpose !== undefined ? '段落作用' : '起因'}>
          <p>{paragraph.paragraphPurpose ?? paragraph.cause}</p>
        </Field>
        <Field label="行动"><p>{paragraph.action}</p></Field>
        <Field label="结果"><p>{paragraph.result}</p></Field>
        <Field label="原文依据"><EvidenceList evidence={paragraph.sourceEvidence} /></Field>
        {paragraph.cluePayoffs?.length > 0 && (
          <Field label="线索回收">
            <ul className="continuation-analysis-stack">
              {paragraph.cluePayoffs.map((item: any, index: number) => (
                <li key={index}><EvidenceList evidence={[item.clue]} /><p>{item.payoff}</p></li>
              ))}
            </ul>
          </Field>
        )}
        {paragraph.emotionChanges?.length > 0 && (
          <Field label="情绪变化">
            <ul className="continuation-analysis-stack">
              {paragraph.emotionChanges.map((item: any, index: number) => (
                <li key={index}>{item.trigger}：{item.from} → {item.to}；{item.visibleAction}</li>
              ))}
            </ul>
          </Field>
        )}
        {paragraph.relationshipChanges?.length > 0 && (
          <Field label="关系变化">
            <ul className="continuation-analysis-stack">
              {paragraph.relationshipChanges.map((item: any, index: number) => (
                <li key={index}>{item.participants.join(' · ')}：{item.from} → {item.to}；{item.cause}</li>
              ))}
            </ul>
          </Field>
        )}
        {paragraph.languageReminder && <Field label="本段语言提醒"><p>{paragraph.languageReminder}</p></Field>}
        <Field label={paragraph.paragraphIndex === 1 ? '衔接下一段' : '结尾落点'}>
          <p>{paragraph.bridge ?? paragraph.ending}</p>
        </Field>
      </dl>
    </div>
  )
}

export function ContinuationAnalysisPanel({
  analysis,
}: {
  analysis: ContinuationWritingAnalysis
}): ReactNode {
  const { modelAnswer, officialModelAnswer } = analysis
  const display = 'continuationAnalysis' in analysis
    ? projectContinuationAnalysisDisplay(analysis.continuationAnalysis)
    : null
  if (!display) {
    return (
      <div className="retained-writing-card continuation-analysis-card">
        <section className="retained-writing-card-section" data-continuation-section="modelAnswer">
          <h5>完整范文</h5>
          {officialModelAnswer && <h6 className="continuation-analysis-role">官方参考范文</h6>}
          {officialModelAnswer && (
            <div className="continuation-analysis-model-answer">
              {officialModelAnswer.split('\n').filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
            </div>
          )}
          <h6 className="continuation-analysis-role">生成参考范文</h6>
          <div className="continuation-analysis-model-answer">
            {modelAnswer.split('\n').filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
          </div>
        </section>
      </div>
    )
  }
  const story = display.storyUnderstanding as ContinuationStoryUnderstanding
  const contract = display.continuationContract as ContinuationContract
  const development = display.developmentPlan as ContinuationDevelopmentPlan
  const legacy = display.legacyDetails
  const alternatives = development.alternatives ?? []
  const qualityRisks = development.qualityRisks ?? []

  return (
    <div className="retained-writing-card continuation-analysis-card">
      <section className="retained-writing-card-section" data-continuation-section="storyUnderstanding">
        <h5>原文理解</h5>
        <p className="continuation-analysis-lead">原文已经建立了什么故事世界</p>
        <dl>
          <Field label="中心情境"><Grounded {...story.centralSituation} /></Field>
          <Field label="原文结束状态"><Grounded {...story.sourceEndState} /></Field>
          <Field label="叙事视角"><Grounded {...story.narrativePerspective} /></Field>
          <Field label="时空框架"><Grounded {...story.timeAndPlaceFrame} /></Field>
          <Field label="人物">
            <ul className="continuation-analysis-stack">
              {story.characters.map((character) => (
                <li key={character.name} className="continuation-analysis-subcard">
                  <h6>{character.name}</h6>
                  <p className="continuation-analysis-role">{character.role}</p>
                  <dl>
                    {character.establishedTraits.length > 0 && (
                      <Field label="已建立特征">
                        <ul className="continuation-analysis-stack">
                          {character.establishedTraits.map((item, index) => (
                            <li key={index}><Grounded {...item} /></li>
                          ))}
                        </ul>
                      </Field>
                    )}
                    {character.motivations.length > 0 && (
                      <Field label="动机">
                        <ul className="continuation-analysis-stack">
                          {character.motivations.map((item, index) => (
                            <li key={index}><Grounded {...item} /></li>
                          ))}
                        </ul>
                      </Field>
                    )}
                    <Field label="当前状态"><Grounded {...character.currentState} /></Field>
                  </dl>
                </li>
              ))}
            </ul>
          </Field>
          {story.relationships.length > 0 && (
            <Field label="关系">
              <ul className="continuation-analysis-stack">
                {story.relationships.map((relationship) => (
                  <li key={relationship.participants.join('-')}>
                    <p className="continuation-analysis-pair">
                      {relationship.participants[0]} · {relationship.participants[1]}
                    </p>
                    <Grounded {...relationship.currentRelation} />
                  </li>
                ))}
              </ul>
            </Field>
          )}
          <Field label="因果链">
            <ul className="continuation-analysis-stack">
              {story.causalChain.map((link, index) => (
                <li key={index} className="continuation-analysis-subcard">
                  <dl>
                    <Field label="因"><Grounded {...link.cause} /></Field>
                    <Field label="果"><Grounded {...link.effect} /></Field>
                  </dl>
                </li>
              ))}
            </ul>
          </Field>
          <Field label="未决问题"><Grounded {...story.unresolvedProblem} /></Field>
          {story.usableClues.length > 0 && (
            <Field label="可用线索">
              <ul className="continuation-analysis-stack">
                {story.usableClues.map((clue, index) => (
                  <li key={index}><Grounded {...clue} /></li>
                ))}
              </ul>
            </Field>
          )}
          <Field label="意义方向">
            <p>
              <span className="continuation-analysis-evidence-source">
                {CONFIDENCE_LABEL[story.meaningDirection.confidence]}
              </span>
              {story.meaningDirection.statement}
            </p>
            <EvidenceList evidence={story.meaningDirection.evidence} />
          </Field>
          <Field label="原文风格"><Grounded {...story.sourceStyle} /></Field>
        </dl>
      </section>

      <section className="retained-writing-card-section" data-continuation-section="continuationContract">
        <h5>续写约束</h5>
        <p className="continuation-analysis-lead">续写必须、适宜、可以和绝不能写什么</p>
        <dl>
          <Field label="必须遵守"><ConstraintList items={contract.hardConstraints} /></Field>
          {contract.softAffordances.length > 0 && (
            <Field label="适宜采用">
              <ul className="continuation-analysis-stack">
                {contract.softAffordances.map((item, index) => (
                  <li key={index}><Grounded {...item} /></li>
                ))}
              </ul>
            </Field>
          )}
          {contract.openChoices.length > 0 && (
            <Field label="可以创造"><StringList items={contract.openChoices} /></Field>
          )}
          <Field label="绝不能写"><ConstraintList items={contract.forbiddenContradictions} /></Field>
          <Field label="两段状态链">
            <div className="continuation-analysis-stack">
              {contract.paragraphs.map((paragraph) => (
                <ParagraphContractCard key={paragraph.paragraphIndex} contract={paragraph} />
              ))}
            </div>
          </Field>
          <Field label="收束要求"><ConstraintList items={contract.closureRequirements} /></Field>
        </dl>
      </section>

      <section className="retained-writing-card-section" data-continuation-section="developmentPlan">
        <h5>两段发展方案</h5>
        <p className="continuation-analysis-lead">一条有依据的路线，按因果、行动和结果分配到两段</p>
        <dl>
          <Field label="选定路线"><p>{development.selectedRoute}</p></Field>
          <Field label="路线依据">
            <ul className="continuation-analysis-stack">
              {development.routeRationale.map((item: ContinuationGroundedStatement, index: number) => (
                <li key={index}><Grounded {...item} /></li>
              ))}
            </ul>
          </Field>
          <Field label="两段分配">
            <div className="continuation-analysis-stack">
              {development.paragraphs.map((paragraph: any) => (
                <DevelopmentParagraphCard key={paragraph.paragraphIndex} paragraph={paragraph} />
              ))}
            </div>
          </Field>
          {alternatives.length > 0 && <Field label="其他可行路线"><StringList items={alternatives} /></Field>}
          {qualityRisks.length > 0 && <Field label="质量风险"><StringList items={qualityRisks} /></Field>}
          {legacy && (
            <Field label="历史分析保留">
              <div className="continuation-analysis-stack">
                <Grounded {...legacy.coreTension} />
                {legacy.drivingMotivations.map((item: ContinuationGroundedStatement, index: number) => <Grounded key={`m-${index}`} {...item} />)}
                {legacy.requiredTurningPoints.map((item: ContinuationGroundedStatement, index: number) => <Grounded key={`t-${index}`} {...item} />)}
                {legacy.eventChain.map((item: any, index: number) => <div key={`e-${index}`}><p>{item.cause} → {item.event} → {item.immediateEffect}</p><EvidenceList evidence={item.evidence} /></div>)}
                {legacy.emotionLogic.map((item: any, index: number) => <p key={`em-${index}`}>{item.trigger}：{item.internalResponse}；{item.visibleAction}</p>)}
                {legacy.relationshipMovement.map((item: any, index: number) => <p key={`r-${index}`}>{item.participants.join(' · ')}：{item.from} → {item.to}；{item.cause}</p>)}
                {legacy.interactionMoves.map((item: any, index: number) => <div key={`i-${index}`}><p>{item.speaker} → {item.listener}：{item.purpose}；{item.relationshipNeed}；{item.expectedEffect}</p><EvidenceList evidence={item.evidence} /></div>)}
                {legacy.cluePayoffs.map((item: any, index: number) => <div key={`clue-${index}`}><EvidenceList evidence={[item.clue]} /><p>{item.payoff}</p></div>)}
                {legacy.characterActionsByParagraph.map((item: any) => <div key={item.paragraphIndex}><p>第{item.paragraphIndex}段人物行动</p><StringList items={item.items} /></div>)}
                <p>{legacy.endingState}</p><p>{legacy.finalEffect}</p>
                <p>{legacy.languageAlignment.personAndPerspective}；{legacy.languageAlignment.baseTense}；{legacy.languageAlignment.narrativeDistanceAndRegister}；{legacy.languageAlignment.sourceStyleContinuity}；{legacy.languageAlignment.dialoguePolicy}</p>
                <StringList items={[
                  ...legacy.languageAlignment.licensedTenseShifts,
                  ...legacy.languageAlignment.cohesionPlan.map((item: any) => `${item.relation}：${item.use}`),
                  ...legacy.languageAlignment.descriptionPriorities,
                  ...legacy.languageAlignment.functionLedLanguage,
                  ...legacy.languageAlignment.languageRisks,
                ]} />
              </div>
            </Field>
          )}
        </dl>
      </section>

      <section className="retained-writing-card-section" data-continuation-section="modelAnswer">
        <h5>完整范文</h5>
        {officialModelAnswer && <h6 className="continuation-analysis-role">官方参考范文</h6>}
        {officialModelAnswer && (
          <div className="continuation-analysis-model-answer">
            {officialModelAnswer.split('\n').filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
          </div>
        )}
        <h6 className="continuation-analysis-role">生成参考范文</h6>
        <div className="continuation-analysis-model-answer">
          {modelAnswer.split('\n').filter(Boolean).map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      </section>
    </div>
  )
}
