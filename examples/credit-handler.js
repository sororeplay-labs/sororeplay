export default {
  initialState: () => ({ balances: {}, seen: [] }),
  apply(state, event) {
    if (state.seen.includes(event.id)) return state;
    const { topics, data } = event.decoded;
    if (topics[0] !== 'credit' || typeof topics[1] !== 'string' || !Number.isSafeInteger(data?.amount) || data.amount < 0) throw new Error('Unexpected demo credit event');
    const account = topics[1];
    const previous = Object.hasOwn(state.balances, account) ? state.balances[account] : '0';
    return { balances: { ...state.balances, [account]: (BigInt(previous) + BigInt(data.amount)).toString() }, seen: [...state.seen, event.id] };
  },
  project: state => ({ balances: state.balances })
};
