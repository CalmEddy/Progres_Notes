# TODO List

This file tracks future tasks and improvements for the project.

## Comedy Generation Pipeline

### High Priority
- [ ] Add UI to display both joke options (A and B) from each JokePair
- [ ] Allow users to select which joke variant (A or B) they prefer
- [ ] Add ability to regenerate individual jokes from a premise
- [ ] **Refresh Metaphor System**: Implement trope recognition and substitution
  - **Summary**: Detect familiar/clichéd metaphors (e.g., "like it owes me money", "train wreck", "dumpster fire") and offer fresh alternatives that preserve the same relationship but use new, concrete imagery from the current context
  - **Approach**: Pattern-based recognition (not taste judgment) → extract relationship → substitute with context-appropriate image
  - **Implementation**: Optional refinement pass that flags clichés and offers 2-3 alternative metaphors
  - **UI**: Could be a "refresh metaphors" button, tooltip suggestions, or hidden second pass
  - **Feasibility**: Very feasible - LLMs excel at pattern recognition and semantic substitution
  - **Status**: Design phase - needs formalization of Trope → Relationship → Replacement pipeline

### Medium Priority
- [ ] Add filtering/ranking logic for premise selection (currently just takes first N)
- [ ] Add metrics/analytics for joke quality tracking
- [ ] Consider adding a third step: joke refinement/polish pass

### Low Priority
- [ ] Add export functionality for generated jokes
- [ ] Add ability to save favorite jokes to a collection
- [ ] Add joke rating/feedback system

## UI/UX Improvements

### High Priority
- [ ] Improve mobile responsiveness of chat interface
- [ ] Add loading states with progress indicators for joke generation

### Medium Priority
- [ ] Add keyboard shortcuts for common actions
- [ ] Improve error messages to be more user-friendly

## Technical Debt

### High Priority
- [ ] Remove deprecated `baseJokes` field once all clients are updated
- [ ] Add comprehensive error handling for edge cases

### Medium Priority
- [ ] Add unit tests for premise normalization
- [ ] Add integration tests for the full pipeline
- [ ] Document the world constraint system

## Future Features

- [ ] Multi-language joke generation support
- [ ] Custom world constraint definitions
- [ ] Premise template library
- [ ] Joke collaboration/sharing features

---

## How to Use This File

- Add new items under the appropriate category
- Mark items as complete by changing `[ ]` to `[x]`
- Move completed items to a "Completed" section at the bottom if desired
- Use this file as a reference when planning work sessions

