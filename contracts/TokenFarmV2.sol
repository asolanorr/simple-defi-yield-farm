// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import './DappToken.sol';
import './LPToken.sol';

/**
 * @title Proportional Token Farm V2
 * @notice Staking farm with versioning, withdrawal fees, lock periods and emergency controls.
 */
contract TokenFarmV2 {
  // Basic state
  string public name = 'Proportional Token Farm V2';
  uint256 public constant VERSION = 2;
  address public owner;
  DAppToken public dappToken;
  LPToken public lpToken;

  // Rewards setings
  uint256 public rewardPerBlock;
  uint256 public minRewardPerBlock;
  uint256 public maxRewardPerBlock;
  uint256 public totalStakingBalance;

  // Withdrawal fee (3%)
  uint256 public withdrawalFeeBasisPoints;
  uint256 public constant BASIS_POINTS_DENOMINATOR = 10000;
  uint256 public accumulatedFees;

  // V2 features
  uint256 public stakingLockPeriod;
  uint256 public earlyWithdrawalPenalty;
  bool public emergencyStop;

  // User data
  struct UserInfo {
    uint256 stakingBalance;
    uint256 checkpoint;
    uint256 pendingRewards;
    bool hasStaked;
    bool isStaking;
    uint256 totalRewardsClaimed;
    uint256 lastClaimBlock;
    uint256 stakingStartBlock;
  }

  address[] public stakers;
  mapping(address => UserInfo) public userInfo;

  // Events
  event Deposit(address indexed user, uint256 amount, uint256 timestamp);
  event Withdraw(
    address indexed user,
    uint256 amount,
    uint256 penalty,
    uint256 timestamp
  );
  event RewardsClaimed(
    address indexed user,
    uint256 amount,
    uint256 fee,
    uint256 netAmount,
    uint256 timestamp
  );
  event RewardsDistributed(
    address indexed owner,
    uint256 totalUsers,
    uint256 timestamp
  );
  event OwnerChanged(
    address indexed oldOwner,
    address indexed newOwner,
    uint256 timestamp
  );
  event RewardPerBlockChanged(
    address indexed owner,
    uint256 oldValue,
    uint256 newValue,
    uint256 timestamp
  );
  event FeesWithdrawn(address indexed owner, uint256 amount, uint256 timestamp);
  event StakingLockPeriodChanged(
    address indexed owner,
    uint256 oldValue,
    uint256 newValue,
    uint256 timestamp
  );
  event EarlyWithdrawalPenaltyChanged(
    address indexed owner,
    uint256 oldValue,
    uint256 newValue,
    uint256 timestamp
  );
  event WithdrawalFeeChanged(
    address indexed owner,
    uint256 oldValue,
    uint256 newValue,
    uint256 timestamp
  );
  event EmergencyStopToggled(
    address indexed owner,
    bool stopped,
    uint256 timestamp
  );

  // Modifiers
  modifier onlyOwner() {
    require(msg.sender == owner, 'Only owner can call this function');
    _;
  }
  modifier onlyStaker() {
    require(userInfo[msg.sender].isStaking, 'User is not staking');
    _;
  }
  modifier onlyStakerOrOwner() {
    require(
      userInfo[msg.sender].isStaking || msg.sender == owner,
      'Not staking and not owner'
    );
    _;
  }
  modifier whenNotEmergency() {
    require(!emergencyStop, 'Contract is in emergency stop');
    _;
  }

  constructor(DAppToken _dappToken, LPToken _lpToken) {
    dappToken = _dappToken;
    lpToken = _lpToken;
    owner = msg.sender;

    // Defaults
    rewardPerBlock = 1e18;
    minRewardPerBlock = 0.1e18;
    maxRewardPerBlock = 10e18;
    withdrawalFeeBasisPoints = 300; // 3%
    stakingLockPeriod = 100; // 100 blocks
    earlyWithdrawalPenalty = 500; // 5%
    emergencyStop = false;
  }

  /**
   * @notice Stake LP tokens
   */
  function deposit(uint256 _amount) external whenNotEmergency {
    require(_amount > 0, 'Amount must be greater than 0');
    require(
      lpToken.transferFrom(msg.sender, address(this), _amount),
      'Transfer failed'
    );

    userInfo[msg.sender].stakingBalance += _amount;
    totalStakingBalance += _amount;

    if (!userInfo[msg.sender].hasStaked) {
      stakers.push(msg.sender);
      userInfo[msg.sender].hasStaked = true;
      userInfo[msg.sender].stakingStartBlock = block.number;
    }

    userInfo[msg.sender].isStaking = true;
    if (userInfo[msg.sender].checkpoint == 0) {
      userInfo[msg.sender].checkpoint = block.number;
    }

    distributeRewards(msg.sender);

    emit Deposit(msg.sender, _amount, block.timestamp);
  }

  /**
   * @notice Withdraw all staked LP tokens
   */
  function withdraw() external onlyStaker whenNotEmergency {
    uint256 balance = userInfo[msg.sender].stakingBalance;
    require(balance > 0, 'No tokens to withdraw');

    uint256 blocksStaked = block.number -
      userInfo[msg.sender].stakingStartBlock;
    uint256 penalty = 0;
    if (blocksStaked < stakingLockPeriod) {
      penalty = (balance * earlyWithdrawalPenalty) / BASIS_POINTS_DENOMINATOR;
      balance = balance - penalty;
    }

    distributeRewards(msg.sender);

    userInfo[msg.sender].stakingBalance = 0;
    totalStakingBalance -= (balance + penalty);
    userInfo[msg.sender].isStaking = false;

    require(lpToken.transfer(msg.sender, balance), 'Transfer failed');

    emit Withdraw(msg.sender, balance, penalty, block.timestamp);
  }

  /**
   * @notice Claim accumulated rewards
   */
  function claimRewards() external whenNotEmergency {
    uint256 pendingAmount = userInfo[msg.sender].pendingRewards;
    require(pendingAmount > 0, 'No rewards to claim');

    uint256 fee = (pendingAmount * withdrawalFeeBasisPoints) /
      BASIS_POINTS_DENOMINATOR;
    uint256 netAmount = pendingAmount - fee;

    userInfo[msg.sender].pendingRewards = 0;
    userInfo[msg.sender].totalRewardsClaimed += netAmount;
    userInfo[msg.sender].lastClaimBlock = block.number;

    accumulatedFees += fee;

    dappToken.mint(msg.sender, netAmount);

    emit RewardsClaimed(
      msg.sender,
      pendingAmount,
      fee,
      netAmount,
      block.timestamp
    );
  }

  /**
   * @notice Distribute rewards to all stakers
   */
  function distributeRewardsAll() external onlyOwner whenNotEmergency {
    for (uint256 i = 0; i < stakers.length; i++) {
      address staker = stakers[i];
      if (userInfo[staker].isStaking) {
        distributeRewards(staker);
      }
    }
    emit RewardsDistributed(msg.sender, stakers.length, block.timestamp);
  }

  /**
   * @dev Internal reward calculation
   */
  function distributeRewards(address beneficiary) private {
    uint256 lastCheckpoint = userInfo[beneficiary].checkpoint;

    if (block.number > lastCheckpoint && totalStakingBalance > 0) {
      uint256 blocksPassed = block.number - lastCheckpoint;
      uint256 userShare = userInfo[beneficiary].stakingBalance;

      if (userShare > 0) {
        uint256 reward = (rewardPerBlock * blocksPassed * userShare) /
          totalStakingBalance;
        userInfo[beneficiary].pendingRewards += reward;
      }

      userInfo[beneficiary].checkpoint = block.number;
    }
  }

  // --- Owner functions ---

  function setRewardPerBlock(uint256 _newRewardPerBlock) external onlyOwner {
    require(_newRewardPerBlock >= minRewardPerBlock, 'Below minimum');
    require(_newRewardPerBlock <= maxRewardPerBlock, 'Above maximum');

    uint256 oldValue = rewardPerBlock;
    rewardPerBlock = _newRewardPerBlock;

    emit RewardPerBlockChanged(
      owner,
      oldValue,
      _newRewardPerBlock,
      block.timestamp
    );
  }

  function setRewardRange(
    uint256 _minReward,
    uint256 _maxReward
  ) external onlyOwner {
    require(_minReward < _maxReward, 'Invalid range');
    require(_maxReward > 0, 'Max must be > 0');

    minRewardPerBlock = _minReward;
    maxRewardPerBlock = _maxReward;

    if (rewardPerBlock < _minReward) {
      rewardPerBlock = _minReward;
    } else if (rewardPerBlock > _maxReward) {
      rewardPerBlock = _maxReward;
    }
  }

  function withdrawFees() external onlyOwner {
    require(accumulatedFees > 0, 'No fees to withdraw');
    uint256 amount = accumulatedFees;
    accumulatedFees = 0;

    dappToken.mint(owner, amount);
    emit FeesWithdrawn(owner, amount, block.timestamp);
  }

  function setWithdrawalFee(uint256 _newFeeBasisPoints) external onlyOwner {
    require(_newFeeBasisPoints <= 1000, 'Fee cannot exceed 10%');
    uint256 oldValue = withdrawalFeeBasisPoints;
    withdrawalFeeBasisPoints = _newFeeBasisPoints;
    emit WithdrawalFeeChanged(
      owner,
      oldValue,
      _newFeeBasisPoints,
      block.timestamp
    );
  }

  function setStakingLockPeriod(uint256 _newLockPeriod) external onlyOwner {
    require(_newLockPeriod <= 10000, 'Lock period cannot exceed 10000 blocks');
    uint256 oldValue = stakingLockPeriod;
    stakingLockPeriod = _newLockPeriod;
    emit StakingLockPeriodChanged(
      owner,
      oldValue,
      _newLockPeriod,
      block.timestamp
    );
  }

  function setEarlyWithdrawalPenalty(
    uint256 _newPenaltyBasisPoints
  ) external onlyOwner {
    require(_newPenaltyBasisPoints <= 2000, 'Penalty cannot exceed 20%');
    uint256 oldValue = earlyWithdrawalPenalty;
    earlyWithdrawalPenalty = _newPenaltyBasisPoints;
    emit EarlyWithdrawalPenaltyChanged(
      owner,
      oldValue,
      _newPenaltyBasisPoints,
      block.timestamp
    );
  }

  function toggleEmergencyStop() external onlyOwner {
    emergencyStop = !emergencyStop;
    emit EmergencyStopToggled(owner, emergencyStop, block.timestamp);
  }

  // --- Emergency ---

  function emergencyWithdraw() external onlyStaker {
    require(emergencyStop, 'Not in emergency');
    uint256 balance = userInfo[msg.sender].stakingBalance;
    require(balance > 0, 'No tokens to withdraw');

    userInfo[msg.sender].stakingBalance = 0;
    userInfo[msg.sender].isStaking = false;
    totalStakingBalance -= balance;

    require(lpToken.transfer(msg.sender, balance), 'Transfer failed');
    emit Withdraw(msg.sender, balance, 0, block.timestamp);
  }

  // --- View helpers ---

  function getAccumulatedFees() external view returns (uint256) {
    return accumulatedFees;
  }

  function getWithdrawalFeeRate() external view returns (uint256) {
    return withdrawalFeeBasisPoints;
  }

  function getStakerCount() external view returns (uint256) {
    return stakers.length;
  }

  function getStakerByIndex(uint256 index) external view returns (address) {
    require(index < stakers.length, 'Index out of bounds');
    return stakers[index];
  }

  function getPendingRewards(address user) external view returns (uint256) {
    return userInfo[user].pendingRewards;
  }

  function getStakingBalance(address user) external view returns (uint256) {
    return userInfo[user].stakingBalance;
  }

  function getUserInfo(
    address user
  )
    external
    view
    returns (
      uint256 stakingBalance,
      uint256 checkpoint,
      uint256 pendingRewards,
      bool hasStaked,
      bool isStaking,
      uint256 totalRewardsClaimed,
      uint256 lastClaimBlock,
      uint256 stakingStartBlock
    )
  {
    UserInfo memory info = userInfo[user];
    return (
      info.stakingBalance,
      info.checkpoint,
      info.pendingRewards,
      info.hasStaked,
      info.isStaking,
      info.totalRewardsClaimed,
      info.lastClaimBlock,
      info.stakingStartBlock
    );
  }

  function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), 'Zero address');
    require(newOwner != owner, 'Already owner');
    address oldOwner = owner;
    owner = newOwner;
    emit OwnerChanged(oldOwner, newOwner, block.timestamp);
  }

  function getVersion() external pure returns (uint256) {
    return VERSION;
  }

  function getContractInfo()
    external
    view
    returns (
      string memory contractName,
      uint256 version,
      uint256 totalStakers,
      uint256 totalStaked,
      bool isEmergencyStopped
    )
  {
    return (name, VERSION, stakers.length, totalStakingBalance, emergencyStop);
  }
}
