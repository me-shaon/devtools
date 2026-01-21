/// <reference types="node" />
import { SpawnOptionsWithoutStdio } from 'child_process';
export default function spawn(exe: string, params: string[], opts?: SpawnOptionsWithoutStdio): Promise<string>;
