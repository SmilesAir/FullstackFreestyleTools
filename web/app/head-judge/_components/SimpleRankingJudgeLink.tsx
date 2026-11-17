"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { useT } from "@/lib/i18n/client";

const noSubscribe = () => () => {};

// The Play tab's Judges section for a Simple Ranking pool: there are no judge
// seats, so it shows the one anonymous link every judge opens instead.
export function SimpleRankingJudgeLink({ eventId }: { eventId: string }) {
  const t = useT();
  // The address this page was opened at, read after mounting (the server
  // doesn't know which host the head judge used).
  const origin = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "",
  );
  const [copied, setCopied] = useState(false);

  if (!origin) return null;
  const url = `${origin}/judge/simple-ranking/${eventId}`;
  const localhost = /^(localhost|127\.|\[::1\])/.test(new URL(origin).hostname);

  const copy = () => {
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-gray-600">{t.headJudge.simpleRankingJudgesHelp}</p>
      <div className="flex items-start gap-3">
        <Qr text={url} />
        <div className="flex min-w-0 flex-col gap-1">
          <a href={url} target="_blank" rel="noreferrer" className="break-all text-sm font-medium text-blue-700 underline">
            {url}
          </a>
          <button type="button" onClick={copy} className="cursor-pointer self-start text-xs text-gray-500 underline">
            {copied ? t.headJudge.copied : t.db.copy}
          </button>
          {localhost && <p className="text-xs text-amber-800">{t.headJudge.simpleRankingLocalhost}</p>}
        </div>
      </div>
    </div>
  );
}

// A QR code of the link, dark on white so phones can read it.
function Qr({ text }: { text: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(text, { type: "svg", margin: 1, width: 128 })
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => !cancelled && setSvg(""));
    return () => {
      cancelled = true;
    };
  }, [text]);
  // The markup is made here from the address; there is nothing from outside in it.
  return <div className="h-[128px] w-[128px] shrink-0 rounded bg-white" dangerouslySetInnerHTML={{ __html: svg }} />;
}
