function TaskCardMini({ id, title }) {
  return (
    <article className="eos-card">
      <span className="eos-card-id">{id}</span>
      <p className="eos-card-title">{title}</p>
    </article>
  );
}

export default TaskCardMini;
