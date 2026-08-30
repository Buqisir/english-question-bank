import type { ReactNode } from 'react'
import type {
  ContinuationAnalysisV1,
  ContinuationCohesionItem,
  ContinuationConstraint,
  ContinuationEvidenceRef,
  ContinuationGroundedStatement,
  ContinuationParagraphBlueprintItem,
  ContinuationParagraphContract,
} from '../../domain/continuationAnalysis.ts'
import type { ContinuationWritingAnalysisV1 } from '../../domain/paperAsset.ts'

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

const COHESION_LABEL: Record<ContinuationCohesionItem['relation'], string> = {
  sequence: '顺序',
  cause: '因果',
  contrast: '对照',
  reference: '指代',
  echo: '回扣',
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

function ParagraphBlueprintCard({
  paragraph,
}: {
  paragraph: ContinuationParagraphBlueprintItem
}): ReactNode {
  return (
    <div className="continuation-analysis-subcard">
      <h6>第{paragraph.paragraphIndex}段蓝图</h6>
      <dl>
        <Field label="叙事功能"><p>{paragraph.narrativeFunction}</p></Field>
        <Field label="事件推进"><StringList items={paragraph.eventMoves} /></Field>
        <Field label="人物行动与反应">
          <StringList items={paragraph.characterActionsAndReactions} />
        </Field>
        <Field label="回用证据">
          <EvidenceList evidence={paragraph.evidenceToReuse} />
        </Field>
        <Field label="状态变化"><p>{paragraph.stateChange}</p></Field>
        <Field label="衔接到下一段"><p>{paragraph.bridgeToNext}</p></Field>
      </dl>
    </div>
  )
}

export function ContinuationAnalysisPanel({
  analysis,
}: {
  analysis: ContinuationWritingAnalysisV1
}): ReactNode {
  const { continuationAnalysis, modelAnswer, officialModelAnswer } = analysis
  const story = continuationAnalysis.storyUnderstanding
  const contract = continuationAnalysis.continuationContract
  const development = continuationAnalysis.narrativeDevelopment
  const language = continuationAnalysis.languageAlignment
  const blueprint = continuationAnalysis.paragraphBlueprint

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

      <section className="retained-writing-card-section" data-continuation-section="narrativeDevelopment">
        <h5>情节推进</h5>
        <p className="continuation-analysis-lead">人物动机与因果关系应怎样推动故事</p>
        <dl>
          <Field label="核心张力"><Grounded {...development.coreTension} /></Field>
          <Field label="驱动动机">
            <ul className="continuation-analysis-stack">
              {development.drivingMotivations.map((item, index) => (
                <li key={index}><Grounded {...item} /></li>
              ))}
            </ul>
          </Field>
          <Field label="必要转折">
            <ul className="continuation-analysis-stack">
              {development.requiredTurningPoints.map((item, index) => (
                <li key={index}><Grounded {...item} /></li>
              ))}
            </ul>
          </Field>
          <Field label="事件链">
            <ul className="continuation-analysis-stack">
              {development.eventChain.map((item, index) => (
                <li key={index} className="continuation-analysis-subcard">
                  <dl>
                    <Field label="原因"><p>{item.cause}</p></Field>
                    <Field label="事件"><p>{item.event}</p></Field>
                    <Field label="即时结果"><p>{item.immediateEffect}</p></Field>
                  </dl>
                  <EvidenceList evidence={item.evidence} />
                </li>
              ))}
            </ul>
          </Field>
          <Field label="情绪逻辑">
            <ul className="continuation-analysis-stack">
              {development.emotionLogic.map((item, index) => (
                <li key={index} className="continuation-analysis-subcard">
                  <dl>
                    <Field label="触发"><p>{item.trigger}</p></Field>
                    <Field label="内在反应"><p>{item.internalResponse}</p></Field>
                    <Field label="可见行动"><p>{item.visibleAction}</p></Field>
                  </dl>
                </li>
              ))}
            </ul>
          </Field>
          {development.relationshipMovement.length > 0 && (
            <Field label="关系变化">
              <ul className="continuation-analysis-stack">
                {development.relationshipMovement.map((item, index) => (
                  <li key={index}>
                    <p className="continuation-analysis-pair">
                      {item.participants[0]} · {item.participants[1]}
                    </p>
                    <p>{item.from} → {item.to}</p>
                    <p>{item.cause}</p>
                  </li>
                ))}
              </ul>
            </Field>
          )}
          {development.interactionMoves.length > 0 && (
            <Field label="人物交际">
              <ul className="continuation-analysis-stack">
                {development.interactionMoves.map((item, index) => (
                  <li key={index} className="continuation-analysis-subcard">
                  <p className="continuation-analysis-pair">
                    {item.speaker} → {item.listener}
                  </p>
                  <dl>
                    <Field label="目的"><p>{item.purpose}</p></Field>
                    <Field label="关系需要"><p>{item.relationshipNeed}</p></Field>
                    <Field label="预期效果"><p>{item.expectedEffect}</p></Field>
                  </dl>
                  <EvidenceList evidence={item.evidence} />
                </li>
                ))}
              </ul>
            </Field>
          )}
          {development.cluePayoffs.length > 0 && (
            <Field label="线索回收">
              <ul className="continuation-analysis-stack">
                {development.cluePayoffs.map((item, index) => (
                  <li key={index}>
                    <EvidenceList evidence={[item.clue]} />
                    <p>{item.payoff}</p>
                  </li>
                ))}
              </ul>
            </Field>
          )}
          <Field label="结尾状态"><p>{development.endingState}</p></Field>
        </dl>
      </section>

      <section className="retained-writing-card-section" data-continuation-section="languageAlignment">
        <h5>语言对齐</h5>
        <p className="continuation-analysis-lead">续写语言怎样与原文和叙事功能保持一致</p>
        <dl>
          <Field label="人称与视角"><p>{language.personAndPerspective}</p></Field>
          <Field label="主体时态"><p>{language.baseTense}</p></Field>
          {language.licensedTenseShifts.length > 0 && (
            <Field label="允许的时态切换"><StringList items={language.licensedTenseShifts} /></Field>
          )}
          <Field label="叙述距离与语域"><p>{language.narrativeDistanceAndRegister}</p></Field>
          <Field label="原文风格延续"><p>{language.sourceStyleContinuity}</p></Field>
          <Field label="衔接计划">
            <ul className="continuation-analysis-stack">
              {language.cohesionPlan.map((item, index) => (
                <li key={index}>
                  <span className="continuation-analysis-evidence-source">
                    {COHESION_LABEL[item.relation]}
                  </span>
                  {item.use}
                </li>
              ))}
            </ul>
          </Field>
          <Field label="对话策略"><p>{language.dialoguePolicy}</p></Field>
          <Field label="描写优先"><StringList items={language.descriptionPriorities} /></Field>
          <Field label="功能带动的语言"><StringList items={language.functionLedLanguage} /></Field>
          <Field label="语言风险"><StringList items={language.languageRisks} /></Field>
        </dl>
      </section>

      <section className="retained-writing-card-section" data-continuation-section="paragraphBlueprint">
        <h5>两段蓝图</h5>
        <p className="continuation-analysis-lead">选定的一条有效路线怎样分配到两个段落</p>
        <dl>
          <Field label="选定路线"><p>{blueprint.selectedRoute}</p></Field>
          <Field label="路线依据">
            <ul className="continuation-analysis-stack">
              {blueprint.routeRationale.map((item, index) => (
                <li key={index}><Grounded {...item} /></li>
              ))}
            </ul>
          </Field>
          <Field label="两段分配">
            <div className="continuation-analysis-stack">
              {blueprint.paragraphs.map((paragraph) => (
                <ParagraphBlueprintCard key={paragraph.paragraphIndex} paragraph={paragraph} />
              ))}
            </div>
          </Field>
          <Field label="最终效果"><p>{blueprint.finalEffect}</p></Field>
          {blueprint.validAlternativeRoutes.length > 0 && (
            <Field label="其他有效路线">
              <StringList items={blueprint.validAlternativeRoutes} />
            </Field>
          )}
          <Field label="质量风险"><StringList items={blueprint.qualityRisks} /></Field>
        </dl>
      </section>

      <section className="retained-writing-card-section" data-continuation-section="modelAnswer">
        <h5>AI 参考范文</h5>
        <div className="continuation-analysis-model-answer">
          {modelAnswer.split('\n').map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      </section>
      {officialModelAnswer && (
        <section className="retained-writing-card-section" data-continuation-section="officialModelAnswer">
          <h5>官方范文</h5>
          <div className="continuation-analysis-model-answer">
            {officialModelAnswer.split('\n').map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
