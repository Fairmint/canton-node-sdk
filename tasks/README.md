# Tasks

Task files for the Canton Node SDK following the Fairmint task-driven development workflow.

## Directory Structure

```
tasks/
├── README.md           # This file
└── YYYY/MM/XX/         # Year/Month/Developer initials
    └── YYYY.MM.DD-short-description.md
```

## Creating a Task

Use the Cursor command:

```
/create-task-file
Implement feature X
[add context]
```

Or create manually following the template in the task files.

## Task File Lifecycle

```
PLANNING → IMPLEMENTING → TESTING → ✅ COMPLETE
```

## Current Tasks

| Task                                                                                           | Status      | Description                                                  |
| ---------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------ |
| [2026.01.12-canton-3.4-upgrade](2026/01/hd/2026.01.12-canton-3.4-upgrade.md)                   | In Progress | Upgrade SDK for Canton 3.4 API compatibility                 |
| [2026.01.02-sdk-refactoring-and-testing](2026/01/hd/2026.01.02-sdk-refactoring-and-testing.md) | Planning    | Improve SDK quality, test coverage, and developer experience |
