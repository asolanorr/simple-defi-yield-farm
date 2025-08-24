// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import './DappToken.sol';
import './LPToken.sol';

/**
 * @title Proportional Token Farm
 * @notice Staking farm where rewards are distributed proportionally to the total staked amount.
 */
contract TokenFarm {
  // Basic state
  string public name = 'Proportional Token Farm';
  address public owner;
  DAppToken public dappToken;
  LPToken public lpToken;

  // Reward settings
  uint256 public rewardPerBlock;
  uint256 public minRewardPerBlock;
  uint256 public maxRewardPerBlock;
  uint256 public totalStakingBalance;

  // Withdrawal fee (3%)
  uint256 public constant WITHDRAWAL_FEE_BASIS_POINTS = 300;
  uint256 public constant BASIS_POINTS_DENOMINATOR = 10000;
  uint256 public accumulatedFees;

  // User staking info
  struct UserInfo {
    uint256 stakingBalance;
    uint256 checkpoint;
    uint256 pendingRewards;
    bool hasStaked;
    bool isStaking;
  }

  address[] public stakers;
  mapping(address => UserInfo) public userInfo;

  // Events
  event Deposit(address indexed user, uint256 amount, uint256 timestamp);
  event Withdraw(address indexed user, uint256 amount, uint256 timestamp);
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

  // Access control
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
      'Not allowed'
    );
    _;
  }

  constructor(DAppToken _dappToken, LPToken _lpToken) {
    dappToken = _dappToken;
    lpToken = _lpToken;
    owner = msg.sender;

    // Default reward range
    rewardPerBlock = 1e18;
    minRewardPerBlock = 0.1e18;
    maxRewardPerBlock = 10e18;
  }

  /**
   * @notice Deposit LP tokens into the farm.
   * @param _amount The amount of LP tokens to stake.
   */
  function deposit(uint256 _amount) external {
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
    }

    userInfo[msg.sender].isStaking = true;

    if (userInfo[msg.sender].checkpoint == 0) {
      userInfo[msg.sender].checkpoint = block.number;
    }

    distributeRewards(msg.sender);

    emit Deposit(msg.sender, _amount, block.timestamp);
  }

  /**
   * @notice Withdraw all staked LP tokens.
   */
  function withdraw() external onlyStaker {
    uint256 balance = userInfo[msg.sender].stakingBalance;
    require(balance > 0, 'No tokens to withdraw');

    distributeRewards(msg.sender);

    userInfo[msg.sender].stakingBalance = 0;
    totalStakingBalance -= balance;
    userInfo[msg.sender].isStaking = false;

    require(lpToken.transfer(msg.sender, balance), 'Transfer failed');

    emit Withdraw(msg.sender, balance, block.timestamp);
  }

  /**
   * @notice Claim pending rewards (after fee deduction).
   */
  function claimRewards() external {
    uint256 pendingAmount = userInfo[msg.sender].pendingRewards;
    require(pendingAmount > 0, 'No rewards to claim');

    uint256 fee = (pendingAmount * WITHDRAWAL_FEE_BASIS_POINTS) /
      BASIS_POINTS_DENOMINATOR;
    uint256 netAmount = pendingAmount - fee;

    userInfo[msg.sender].pendingRewards = 0;
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
   * @notice Distribute rewards to all active stakers.
   */
  function distributeRewardsAll() external onlyOwner {
    for (uint256 i = 0; i < stakers.length; i++) {
      address staker = stakers[i];
      if (userInfo[staker].isStaking) {
        distributeRewards(staker);
      }
    }

    emit RewardsDistributed(msg.sender, stakers.length, block.timestamp);
  }

  /**
   * @notice Update user rewards based on their stake.
   * @param beneficiary The user whose rewards are updated.
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

  /**
   * @notice Update reward per block within allowed range.
   * @param _newRewardPerBlock The new reward per block.
   */
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

  /**
   * @notice Set the min and max reward per block.
   * @param _minReward Minimum allowed reward per block.
   * @param _maxReward Maximum allowed reward per block.
   */
  function setRewardRange(
    uint256 _minReward,
    uint256 _maxReward
  ) external onlyOwner {
    require(_minReward < _maxReward, 'Min must be less than max');
    require(_maxReward > 0, 'Max must be greater than 0');

    minRewardPerBlock = _minReward;
    maxRewardPerBlock = _maxReward;

    if (rewardPerBlock < _minReward) {
      rewardPerBlock = _minReward;
    } else if (rewardPerBlock > _maxReward) {
      rewardPerBlock = _maxReward;
    }
  }

  /**
   * @notice Withdraw accumulated fees to the owner.
   */
  function withdrawFees() external onlyOwner {
    require(accumulatedFees > 0, 'No fees to withdraw');

    uint256 amount = accumulatedFees;
    accumulatedFees = 0;

    dappToken.mint(owner, amount);

    emit FeesWithdrawn(owner, amount, block.timestamp);
  }

  // Utility getters
  function getAccumulatedFees() external view returns (uint256) {
    return accumulatedFees;
  }

  function getWithdrawalFeeRate() external pure returns (uint256) {
    return WITHDRAWAL_FEE_BASIS_POINTS;
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
      bool isStaking
    )
  {
    UserInfo memory info = userInfo[user];
    return (
      info.stakingBalance,
      info.checkpoint,
      info.pendingRewards,
      info.hasStaked,
      info.isStaking
    );
  }

  /**
   * @notice Transfer contract ownership to a new address.
   * @param newOwner The address of the new owner.
   */
  function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), 'New owner cannot be zero address');
    require(newOwner != owner, 'Already owner');

    address oldOwner = owner;
    owner = newOwner;

    emit OwnerChanged(oldOwner, newOwner, block.timestamp);
  }
}
