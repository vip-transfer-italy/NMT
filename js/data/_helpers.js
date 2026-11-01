// Helpers for content packs. Load after the base subject files, before app.js.
window.NMT = window.NMT || { subjects: {} };
NMT.addQuestions = function (subj, topicId, qs) {
  const t = NMT.subjects[subj].topics.find((x) => x.id === topicId);
  if (!t) throw new Error("No topic " + subj + "/" + topicId);
  t.questions.push.apply(t.questions, qs); // append only: question ids depend on position
};
// Insert a topic after `afterId` (null = at the start). Topic order only affects the study plan.
NMT.addTopic = function (subj, afterId, topic) {
  const list = NMT.subjects[subj].topics;
  if (list.some((x) => x.id === topic.id)) throw new Error("Duplicate topic " + topic.id);
  if (afterId === null) { list.unshift(topic); return; }
  const i = list.findIndex((x) => x.id === afterId);
  if (i < 0) list.push(topic); else list.splice(i + 1, 0, topic);
};
