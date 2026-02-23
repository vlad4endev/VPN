import PropTypes from 'prop-types'

/**
 * PropTypes для UserCard компонента
 */
export const UserCardPropTypes = {
  // Обязательные пропсы
  user: PropTypes.shape({
    id: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
    uuid: PropTypes.string,
    name: PropTypes.string,
    phone: PropTypes.string,
    expiresAt: PropTypes.oneOfType([
      PropTypes.number,
      PropTypes.string, // Firestore может возвращать ISO строки или Timestamp
    ]),
    trafficGB: PropTypes.number,
    devices: PropTypes.number,
    tariffId: PropTypes.string,
    plan: PropTypes.string,
    role: PropTypes.string,
    createdAt: PropTypes.oneOfType([
      PropTypes.number,
      PropTypes.string, // Firestore может возвращать ISO строки
    ]),
  }).isRequired,
  
  onClose: PropTypes.func.isRequired,
  
  // Опциональные пропсы
  onCopy: PropTypes.func,
  tariffs: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      plan: PropTypes.string.isRequired,
      price: PropTypes.number.isRequired,
      devices: PropTypes.number,
      trafficGB: PropTypes.number,
      active: PropTypes.bool,
      subscriptionLink: PropTypes.string,
    })
  ),
  servers: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      serverIP: PropTypes.string,
      serverPort: PropTypes.number,
      protocol: PropTypes.string,
      randompath: PropTypes.string,
      location: PropTypes.string,
      xuiInboundId: PropTypes.string,
      xuiUsername: PropTypes.string,
      tariffIds: PropTypes.arrayOf(PropTypes.string),
    })
  ),
  formatDate: PropTypes.func,
  // onSave и onGenerateUUID теперь получаются из AdminContext, не передаются через пропсы
}

export default UserCardPropTypes

