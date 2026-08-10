"use client";

import {
  GoogleTopAppBar,
  type WorkflowStage,
  type WorkflowStageInfo,
  WORKFLOW_STAGES,
  type GoogleTopAppBarProps,
} from "./GoogleTopAppBar";

export type { WorkflowStage, WorkflowStageInfo };
export { WORKFLOW_STAGES };

export type WorkflowHeaderProps = GoogleTopAppBarProps;

export function WorkflowHeader(props: WorkflowHeaderProps) {
  return <GoogleTopAppBar {...props} />;
}
