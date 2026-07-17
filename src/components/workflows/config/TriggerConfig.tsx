import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TriggerConfigProps {
  subType: string;
  config: any;
  onChange: (config: any) => void;
  webhookToken?: string | null;
}

export default function TriggerConfig({ subType, config, onChange, webhookToken }: TriggerConfigProps) {
  if (subType === "manual") {
    return <p className="text-xs text-muted-foreground">No configuration needed. Use the Run button to trigger manually.</p>;
  }

  if (subType === "schedule") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Cron Expression</Label>
        <Input
          className="h-9 text-sm font-mono"
          placeholder="0 */6 * * *"
          value={config.cron || ""}
          onChange={(e) => onChange({ ...config, cron: e.target.value })}
        />
        <p className="text-[10px] text-muted-foreground">
          Examples: <code>0 */6 * * *</code> (every 6h), <code>0 9 * * 1</code> (Mon 9am)
        </p>
      </div>
    );
  }

  if (subType === "webhook") {
    const url = webhookToken ? `${window.location.origin}/api/webhooks/${webhookToken}` : "Save workflow first";
    return (
      <div className="space-y-2">
        <Label className="text-xs">Webhook URL</Label>
        <div className="flex gap-1">
          <Input className="h-9 text-xs font-mono" readOnly value={url} />
        </div>
        <p className="text-[10px] text-muted-foreground">
          Configure this URL in Immich admin webhook settings.
        </p>
      </div>
    );
  }

  return null;
}
