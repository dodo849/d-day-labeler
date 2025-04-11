/**
 * d-day-labeler
 * Copyright (c) 2023-present NAVER Corp.
 * Apache-2.0
 */

import * as core from "@actions/core";
import {addLabels, getPRList, removeLabel} from "./api";
import {initialize} from "./initialize";
import type {TPRListData} from "./types";

const D_N_PATTERN = /^D-(\d+)$/;
const DUE_DATE_PATTERN = /\(~(\d{1,2})\/(\d{1,2})\)/;

interface ILabelChange {
    number: number;
    current: string;
    next: string;
}

const extractDueDate = (title: string): Date | undefined => {
    const match = title.match(DUE_DATE_PATTERN);
    if (!match) return undefined;

    const [, month, day] = match;
    const currentYear = new Date().getFullYear();
    const dueDate = new Date(currentYear, parseInt(month) - 1, parseInt(day));

    // 현재 연도의 날짜가 지났다면 다음 연도로 설정
    if (dueDate < new Date()) {
        dueDate.setFullYear(currentYear + 1);
    }

    return dueDate;
};

const calculateDday = (dueDate: Date): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = dueDate.getTime() - today.getTime();

    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const updateLabel = async ({number, current, next}: ILabelChange): Promise<boolean> => {
    // 현재 라벨이 없고 새로운 라벨만 있는 경우
    if (!current && next) {
        return addLabels(number, [next])
            .then(() => {
                core.info(`Successfully added label "${next}" to PR #${number}`);
                return true;
            })
            .catch(error => {
                core.warning(`Failed to add label for PR #${number}: ${error.message}`);
                throw error;
            });
    }

    // 라벨이 변경되는 경우
    if (current !== next) {
        return Promise.all([
            current ? removeLabel(number, current) : Promise.resolve(),
            next ? addLabels(number, [next]) : Promise.resolve(),
        ])
            .then(() => {
                core.info(`Successfully updated label for PR #${number} from "${current}" to "${next}"`);
                return true;
            })
            .catch(error => {
                core.warning(`Failed to update label for PR #${number}: ${error.message}`);
                throw error;
            });
    }

    return false;
};

const updateLabels = async (changes: ILabelChange[]): Promise<boolean[]> => {
    return Promise.all(changes.map(updateLabel));
};

const extractLabelChanges = (prList: TPRListData): ILabelChange[] => {
    core.info(`prList ${prList}`);

    return prList
        .map(({number, labels, title}) => {
            const dueDate = extractDueDate(title);
            core.info(`Find dueDate ${dueDate}`);

            if (!dueDate) return null;
            const dDay = calculateDday(dueDate);
            const currentLabel = labels.find(({name}) => D_N_PATTERN.test(name))?.name;

            // D-day가 10일 이하인 경우에만 라벨 변경
            if (dDay <= 10) {
                const nextLabel = `D-${dDay}`;
                return {
                    number,
                    current: currentLabel || "",
                    next: nextLabel,
                };
            }
            return null;
        })
        .filter((change): change is ILabelChange => change !== null);
};

const run = async (): Promise<void> => {
    try {
        initialize();

        const updated = await getPRList().then(extractLabelChanges).then(updateLabels);

        core.info(`Successfully updated labels for all ${updated.filter(Boolean).length} PRs.`);
    } catch (error) {
        core.setFailed((error as Error).message);
    }
};

run();
