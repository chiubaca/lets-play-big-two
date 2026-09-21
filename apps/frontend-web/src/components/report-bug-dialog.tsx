import html2canvas from "html2canvas";
import { Bug, Loader2, Send, X } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { honoClient } from "~/libs/hono-client";

function deviceDetails() {
  return {
    screen: `${window.screen.width} × ${window.screen.height}`,
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    pixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    url: window.location.href,
  };
}

export function ReportBugDialog() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<string>();
  const [captureError, setCaptureError] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string>();

  const openReport = async () => {
    setStatus(undefined);
    setCaptureError(false);
    setCapturing(true);
    try {
      const canvas = await html2canvas(document.body, {
        scale: Math.min(window.devicePixelRatio, 2),
        useCORS: true,
        logging: false,
      });
      setScreenshot(canvas.toDataURL("image/png"));
    } catch (error) {
      console.warn("Could not capture bug report screenshot", error);
      setCaptureError(true);
    } finally {
      setCapturing(false);
      setOpen(true);
    }
  };

  const sendReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setStatus(undefined);
    try {
      const response = await honoClient.api.bug.report.$post({
        json: { message, screenshot, device: deviceDetails() },
      });
      if (!response.ok) throw new Error("Could not send report");
      setMessage("");
      setStatus("Thanks — your report has been sent.");
    } catch {
      setStatus("We couldn’t send that report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="rounded-full px-1 text-sm font-semibold text-foreground transition-colors hover:text-primary"
        onClick={() => void openReport()}
        disabled={capturing}
      >
        {capturing ? "Preparing…" : "Report a bug"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="max-w-lg">
          <button
            type="button"
            className="absolute top-2 right-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close bug report"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
          <div className="flex items-center gap-2">
            <Bug className="text-primary" size={20} />
            <DialogTitle>Report a bug</DialogTitle>
          </div>
          <DialogDescription>
            Tell us what went wrong. We’ll include your screen size, device details, and a
            screenshot of the page before this form opened.
          </DialogDescription>
          {captureError && (
            <p className="text-sm text-destructive" role="alert">
              We couldn’t capture the screenshot, but you can still send the report.
            </p>
          )}
          <form className="grid gap-4" onSubmit={sendReport}>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="bug-report-message">
              What happened?
              <textarea
                id="bug-report-message"
                required
                minLength={1}
                maxLength={5000}
                rows={6}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Describe the problem and what you expected to happen…"
                className="resize-y rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </label>
            {status && (
              <p className="text-sm text-muted-foreground" role="status">
                {status}
              </p>
            )}
            <Button type="submit" variant="gold" disabled={sending || !message.trim()}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              {sending ? "Sending…" : "Send report"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
