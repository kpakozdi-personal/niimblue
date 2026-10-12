<script lang="ts">
  import { tr } from "$/utils/i18n";

  interface Props {
    value: unknown;
    onChange: (value: string) => void;
  }

  let { value, onChange }: Props = $props();
</script>

<select class="form-select" {value} onchange={(e) => onChange(e.currentTarget.value)}>
  <option value="white">{$tr("params.color.white")}</option>
  <option value="black">{$tr("params.color.black")}</option>
  <option value="red">{$tr("params.color.red")}</option>
  <option value="transparent">{$tr("params.color.transparent")}</option>
</select>
