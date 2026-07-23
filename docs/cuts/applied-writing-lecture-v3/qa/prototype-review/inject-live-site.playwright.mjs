async (page) => {
  await page.waitForSelector('.paper-browse-content');
  await page.waitForSelector('.paper-browse-lecture-panel');

  const result = await page.evaluate(() => {
    const PACKETS = {
      2022: {
        title: '2022年新课标Ⅰ卷 · 应用文写作',
        form: '邀请邮件',
        topic: '邀请外教参加校广播访谈',
        reader: '外教 Caroline',
        person: '第一人称为主，第二人称指向对方',
        tense: '一般现在时为主',
        type: '邀请类',
        points: ['节目介绍', '访谈时间和话题'],
        readerCares: '节目价值与访谈安排',
        readerWants: '目的明确、安排具体、保留协商余地',
        value: '让对方清楚为何受邀、需要分享什么以及如何回复',
      },
      2024: {
        title: '2024年新课标Ⅰ卷 · 应用文写作',
        form: '分享邮件',
        topic: '分享一次公园美术课经历',
        reader: '英国朋友 Chris',
        person: '第一人称',
        tense: '一般过去时为主',
        type: '分享类',
        points: ['完成的作品', '个人感想'],
        readerCares: '作品画面与经历变化',
        readerWants: '具体细节与真实感受',
        value: '让朋友看见这次经历，并理解它带来的新发现',
      },
    };

    if (typeof window.__awlV3Restore === 'function') window.__awlV3Restore();

    const paperId = new URL(location.href).searchParams.get('paperId') || '';
    const pilot = paperId.includes('2022') ? '2022' : paperId.includes('2024') ? '2024' : null;
    if (!pilot) throw new Error(`无法从当前真实试卷识别 pilot: ${paperId || 'missing paperId'}`);

    const packet = PACKETS[pilot];
    const canvas = document.querySelector('.paper-browse-content');
    const rail = document.querySelector('.paper-browse-lecture-panel');
    const writingSections = [...document.querySelectorAll('.paper-browse-group-card--writing')];
    const writingSection =
      writingSections.find((section) => section.querySelector('.pi-writing-answer-box--letter')) ||
      writingSections[0];
    const answer = writingSection?.querySelector('.pi-writing-answer-box');

    if (!(canvas instanceof HTMLElement) || !(rail instanceof HTMLElement) ||
        !(writingSection instanceof HTMLElement) || !(answer instanceof HTMLElement)) {
      throw new Error('真实网站的卷面、应用文答题框或讲评栏未就绪');
    }

    const canvasWidth = Math.round(canvas.getBoundingClientRect().width);
    if (canvasWidth < 794) {
      throw new Error(`真实卷面当前只有 ${canvasWidth}px；请把窗口放宽到卷面恢复 794px 后再注入`);
    }

    const answerOffset = Math.round(
      answer.getBoundingClientRect().left - canvas.getBoundingClientRect().left,
    );
    const originalAnswerStyle = answer.getAttribute('style');
    const originalRailNodes = [...rail.childNodes];
    const originalScrollY = window.scrollY;

    const style = document.createElement('style');
    style.id = 'awl-v3-live-injection-style';
    style.textContent = `
      #awl-v3-live-stage {
        position: relative;
        width: 794px;
        height: 472px;
        margin: 0 0 0 calc(var(--awl-v3-answer-offset) * -1);
        overflow: hidden;
        background: #fff;
      }
      #awl-v3-live-stage iframe {
        display: block;
        width: 794px;
        height: 472px;
        border: 0;
        background: #fff;
      }
      .awl-v3-live-rail {
        display: flex;
        flex-direction: column;
        gap: 10px;
        color: #20231f;
        font: 12px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif;
      }
      .awl-v3-live-rail__gate {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 10px;
        color: #285d49;
        background: #edf4f0;
        border: 1px solid #cfe0d7;
        border-radius: 8px;
        font-size: 11px;
      }
      .awl-v3-live-rail__restore {
        padding: 4px 8px;
        color: #4f5c55;
        background: #fff;
        border: 1px solid #cfd6d2;
        border-radius: 999px;
        cursor: pointer;
        font: inherit;
      }
      .awl-v3-live-rail h2,
      .awl-v3-live-rail h3,
      .awl-v3-live-rail h4 { margin: 0; }
      .awl-v3-live-rail h2 { font-size: 15px; }
      .awl-v3-live-rail h3 { margin-top: 2px; font-size: 13px; }
      .awl-v3-live-rail h4 {
        margin-top: 2px;
        color: #2c7257;
        font-size: 10px;
        letter-spacing: .05em;
      }
      .awl-v3-live-rail__facts {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .awl-v3-live-rail__fact,
      .awl-v3-live-rail__row {
        padding: 7px 8px;
        background: #fff;
        border: 1px solid #dfdcd4;
        border-radius: 5px;
      }
      .awl-v3-live-rail__fact small,
      .awl-v3-live-rail__row small {
        display: block;
        margin-bottom: 2px;
        color: #87837a;
        font-size: 9px;
      }
      .awl-v3-live-rail__row + .awl-v3-live-rail__row { margin-top: -5px; }
      .awl-v3-live-rail__note {
        padding: 9px 10px;
        color: #4c5d55;
        background: #edf2ee;
        border-radius: 6px;
        font-size: 10px;
      }
    `;
    document.head.appendChild(style);

    const stage = document.createElement('div');
    stage.id = 'awl-v3-live-stage';
    stage.dataset.pilot = pilot;
    stage.style.setProperty('--awl-v3-answer-offset', `${answerOffset}px`);
    const frame = document.createElement('iframe');
    frame.id = 'awl-v3-prototype-frame';
    frame.title = `${packet.title} · Variant A owner 验收画布`;
    frame.src = `http://127.0.0.1:8766/prototype-pilot-review.html?embedded=1&pilot=${pilot}&variant=A&page=0`;
    stage.appendChild(frame);

    answer.style.display = 'none';
    answer.insertAdjacentElement('afterend', stage);

    const root = document.createElement('div');
    root.className = 'awl-v3-live-rail';

    const gate = document.createElement('div');
    gate.className = 'awl-v3-live-rail__gate';
    const gateText = document.createElement('span');
    gateText.textContent = `原型临时注入 · ${pilot} · 刷新即恢复`;
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'awl-v3-live-rail__restore';
    restore.textContent = '撤销注入';
    restore.addEventListener('click', () => window.__awlV3Restore?.());
    gate.append(gateText, restore);
    root.appendChild(gate);

    const title = document.createElement('h2');
    title.textContent = '应用文写作';
    const subtitle = document.createElement('h3');
    subtitle.textContent = '审题卡';
    root.append(title, subtitle);

    const addHeading = (text) => {
      const heading = document.createElement('h4');
      heading.textContent = text;
      root.appendChild(heading);
    };
    const addRow = (text, label) => {
      const row = document.createElement('div');
      row.className = 'awl-v3-live-rail__row';
      if (label) {
        const small = document.createElement('small');
        small.textContent = label;
        row.appendChild(small);
      }
      row.append(document.createTextNode(text));
      root.appendChild(row);
    };

    addHeading('基础五定');
    const facts = document.createElement('div');
    facts.className = 'awl-v3-live-rail__facts';
    [
      ['文体', packet.form],
      ['话题', packet.topic],
      ['读者', packet.reader],
      ['人称', packet.person],
      ['主时态', packet.tense],
      ['判型', packet.type],
    ].forEach(([label, value]) => {
      const fact = document.createElement('div');
      fact.className = 'awl-v3-live-rail__fact';
      const small = document.createElement('small');
      small.textContent = label;
      fact.append(small, document.createTextNode(value));
      facts.appendChild(fact);
    });
    root.appendChild(facts);

    addHeading('圈要点、编号');
    addRow(`① ${packet.points[0]}`);
    addRow(`② ${packet.points[1]}`);
    addHeading('读者三问');
    addRow(packet.readerCares, '他最关心什么？');
    addRow(packet.readerWants, '他要什么具体信息？');
    addHeading('价值落点');
    addRow(packet.value);
    const note = document.createElement('div');
    note.className = 'awl-v3-live-rail__note';
    note.textContent = 'A · 全局空白求交 · 已中选。此处只验证真实网站中的卷面、讲评栏与交互，不代表 owner 已说“过关”。';
    root.appendChild(note);
    rail.replaceChildren(root);

    window.__awlV3Restore = () => {
      stage.remove();
      style.remove();
      if (originalAnswerStyle === null) answer.removeAttribute('style');
      else answer.setAttribute('style', originalAnswerStyle);
      rail.replaceChildren(...originalRailNodes);
      document.documentElement.removeAttribute('data-awl-v3-prototype');
      window.scrollTo({ top: originalScrollY, behavior: 'instant' });
      delete window.__awlV3Restore;
    };
    document.documentElement.dataset.awlV3Prototype = pilot;
    writingSection.scrollIntoView({ block: 'center', behavior: 'instant' });

    return {
      pilot,
      canvasWidth,
      answerOffset,
      frame: frame.src,
      transient: true,
    };
  });

  await page.waitForSelector('#awl-v3-prototype-frame');
  await page.waitForFunction(() => {
    const frame = document.querySelector('#awl-v3-prototype-frame');
    return frame instanceof HTMLIFrameElement && frame.contentWindow !== null;
  });
  return result;
}
